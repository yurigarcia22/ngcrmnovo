#!/usr/bin/env bash
# Backup diario do CRM NG. Roda no VPS pelo cron (/etc/cron.d/crm-backup), como root.
#   1. pg_dump do banco da Supabase com o usuario backup_leitura (so leitura);
#   2. confere o dump antes de confiar nele (tamanho e tabelas principais);
#   3. criptografa com age. O servidor so tem a chave PUBLICA: tranca, nao abre.
#      A chave privada fica fora do servidor (credentials.md);
#   4. envia para o Backblaze B2 em banco/ (o bucket guarda 30 dias sozinho);
#   5. espelha as midias novas do Storage (midia.py) e envia em midia/.
# A chave do B2 nao tem permissao de apagar: quem invadir o VPS nao some com os backups.
# Qualquer falha manda aviso no Telegram. Segredos em /opt/crm-backup/.env (chmod 600).
set -Eeuo pipefail

DIR=/opt/crm-backup
PG_IMAGE=postgres:17
set -a
# shellcheck disable=SC1091
source "$DIR/.env"   # PGHOST PGUSER PGPASSWORD SUPABASE_URL B2_BUCKET RCLONE_CONFIG_B2_* TELEGRAM_*
set +a

ETAPA="inicio"
avisar() {
  curl -fsS -m 20 "https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT}" --data-urlencode "text=$1" >/dev/null || true
}
falhou() {
  echo "$(date -u +%FT%TZ) FALHOU na etapa: $ETAPA"
  avisar "🔴 Backup do CRM falhou na etapa: ${ETAPA}. Detalhes: ssh crm-vps tail -40 /var/log/crm-backup.log"
  rm -f "$DIR"/tmp/crm_*
}
trap falhou ERR

exec 9>"$DIR/.trava"
flock -n 9 || { echo "$(date -u +%FT%TZ) outro backup ainda rodando, saindo"; exit 0; }

STAMP=$(date -u +%Y-%m-%d_%H%M)
NOME="crm_${STAMP}.dump"
echo "$(date -u +%FT%TZ) inicio $NOME"
rm -f "$DIR"/tmp/crm_*

ETAPA="pg_dump do banco"
# --network host: a conexao direta da Supabase e so IPv6 e a rede padrao do Docker nao tem.
# Historico do pg_cron e respostas do pg_net sao descartaveis: vai so a estrutura.
docker run --rm --network host -e PGPASSWORD -v "$DIR/tmp:/out" "$PG_IMAGE" \
  pg_dump -h "$PGHOST" -p 5432 -U "$PGUSER" -d postgres --no-password -Fc -Z 6 \
  --exclude-table-data=cron.job_run_details --exclude-table-data=net._http_response \
  -f "/out/$NOME"

ETAPA="conferencia do dump"
TAM=$(stat -c %s "$DIR/tmp/$NOME")
if [ "$TAM" -lt 5000000 ]; then echo "dump pequeno demais: $TAM bytes"; false; fi
TOC=$(docker run --rm -v "$DIR/tmp:/out:ro" "$PG_IMAGE" pg_restore -l "/out/$NOME")
for t in "public deals" "public messages" "public contacts" "auth users" "storage objects"; do
  if ! grep -q "TABLE DATA $t " <<<"$TOC"; then echo "falta $t no dump"; false; fi
done

ETAPA="criptografia"
age -R "$DIR/destinatario.txt" -o "$DIR/tmp/$NOME.age" "$DIR/tmp/$NOME"
rm -f "$DIR/tmp/$NOME"

ETAPA="envio do banco para o B2"
rclone copyto "$DIR/tmp/$NOME.age" "b2:$B2_BUCKET/banco/$NOME.age"
rm -f "$DIR/tmp/$NOME.age"
echo "$(date -u +%FT%TZ) banco enviado ($((TAM / 1048576)) MB)"

ETAPA="espelho das midias"
python3 "$DIR/midia.py"

ETAPA="envio das midias para o B2"
rclone copy "$DIR/midia" "b2:$B2_BUCKET/midia" --fast-list --transfers 8

date -u +%FT%TZ > "$DIR/ultimo_ok.txt"
echo "$(date -u +%FT%TZ) fim ok"

# Toda segunda um "tudo certo", para o silencio nunca ser confundido com backup parado.
if [ "$(date +%u)" = "1" ]; then
  ETAPA="resumo semanal"
  DIAS=$(rclone lsf "b2:$B2_BUCKET/banco" --max-age 7d | wc -l)
  MIDIAS=$(find "$DIR/midia" -type f | wc -l)
  avisar "🟢 Backup do CRM ok: ${DIAS} backups do banco nos últimos 7 dias, o último com $((TAM / 1048576)) MB, e ${MIDIAS} mídias guardadas."
fi
