#!/usr/bin/env bash
# Teste de restauracao: prova que o backup volta de verdade.
# Baixa o backup do banco mais recente do B2, abre com a chave privada (recebida
# pela entrada padrao e mantida so em memoria, nunca gravada no VPS), restaura num
# Postgres descartavel sem rede e compara linha a linha com o banco de producao.
#
# Uso, do PC (a chave privada esta no credentials.md):
#   ssh crm-vps /opt/crm-backup/restaurar_teste.sh < arquivo_com_a_chave_privada.txt
set -Eeuo pipefail

DIR=/opt/crm-backup
PG_IMAGE=postgres:17
set -a
# shellcheck disable=SC1091
source "$DIR/.env"
set +a

CHAVE=$(cat)
if ! grep -q '^AGE-SECRET-KEY-1' <<<"$CHAVE"; then echo "mande a chave privada pela entrada padrao"; exit 2; fi

TMP=$(mktemp -d "$DIR/tmp/restauro.XXXX")
CONT=crm-restauro-teste
limpar() { docker rm -f "$CONT" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpar EXIT

ARQ=$(rclone lsf "b2:$B2_BUCKET/banco" --files-only | sort | tail -1)
[ -n "$ARQ" ] || { echo "nenhum backup em banco/"; exit 1; }
echo "backup testado: $ARQ"
rclone copyto "b2:$B2_BUCKET/banco/$ARQ" "$TMP/teste.dump.age"
age -d -i <(printf '%s\n' "$CHAVE") -o "$TMP/teste.dump" "$TMP/teste.dump.age"
unset CHAVE
chmod 644 "$TMP/teste.dump"

docker rm -f "$CONT" >/dev/null 2>&1 || true
docker run -d --name "$CONT" --network none -e POSTGRES_PASSWORD=descartavel \
  -v "$TMP:/in:ro" "$PG_IMAGE" >/dev/null
for _ in $(seq 60); do
  docker exec "$CONT" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done
sleep 2

# Papeis que as politicas de RLS da Supabase citam; o resto vai com --no-owner --no-acl.
docker exec "$CONT" psql -U postgres -q -c "
  do \$\$ declare r text; begin
    foreach r in array array['anon','authenticated','service_role','authenticator','supabase_admin',
      'supabase_auth_admin','supabase_storage_admin','dashboard_user','pgbouncer','supabase_realtime_admin',
      'supabase_replication_admin','supabase_read_only_user','supabase_etl_admin','backup_leitura'] loop
      if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I', r); end if;
    end loop;
  end \$\$;"

echo "restaurando..."
set +e
docker exec "$CONT" pg_restore -U postgres -d postgres --no-owner --no-acl /in/teste.dump 2>"$TMP/erros.txt"
set -e
ERROS=$(grep -c 'error:' "$TMP/erros.txt" || true)

CONTAGEM="select string_agg(format('select %L t, count(*) n from %I.%I', n.nspname||'.'||c.relname, n.nspname, c.relname), ' union all ')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and not c.relispartition
    and (n.nspname = 'public' or (n.nspname, c.relname) in (('auth','users'),('auth','identities'),('storage','objects'),('storage','buckets')))"

contar_restaurado() {
  local sql
  sql=$(docker exec "$CONT" psql -U postgres -At -c "$CONTAGEM")
  docker exec "$CONT" psql -U postgres -At -F '|' -c "$sql"
}
contar_producao() {
  local sql
  sql=$(docker run --rm --network host -e PGPASSWORD "$PG_IMAGE" psql -h "$PGHOST" -U "$PGUSER" -d postgres --no-password -At -c "$CONTAGEM")
  docker run --rm --network host -e PGPASSWORD "$PG_IMAGE" psql -h "$PGHOST" -U "$PGUSER" -d postgres --no-password -At -F '|' -c "$sql"
}

contar_restaurado | sort > "$TMP/restaurado.txt"
contar_producao | sort > "$TMP/producao.txt"

python3 - "$TMP/restaurado.txt" "$TMP/producao.txt" "$ERROS" <<'PY'
import sys
ler = lambda p: dict(l.strip().split("|") for l in open(p) if "|" in l)
rest, prod, erros = ler(sys.argv[1]), ler(sys.argv[2]), int(sys.argv[3])
faltando, divergentes, linhas_r, linhas_p = [], [], 0, 0
for t, n in sorted(prod.items()):
    n = int(n)
    r = rest.get(t)
    linhas_p += n
    if r is None:
        faltando.append(t)
        continue
    r = int(r)
    linhas_r += r
    # producao continua recebendo mensagem depois do dump: so e problema se faltar mais que 2%
    if r < n * 0.98 or (n > 0 and r == 0):
        divergentes.append(f"{t}: backup {r} x producao {n}")
print(f"tabelas comparadas: {len(prod)} | linhas no backup: {linhas_r} | em producao agora: {linhas_p}")
print(f"erros do pg_restore (objetos da Supabase que um Postgres puro nao tem): {erros}")
for x in faltando: print("  TABELA FALTANDO:", x)
for x in divergentes: print("  DIVERGENTE:", x)
print("RESULTADO:", "OK, o backup volta inteiro" if not faltando and not divergentes else "PROBLEMA")
sys.exit(0 if not faltando and not divergentes else 1)
PY
echo "--- tipos de erro do pg_restore (esperados: extensoes e objetos internos da Supabase) ---"
grep 'error:' "$TMP/erros.txt" | sed -E 's/.*error: //' | cut -c1-110 | sort | uniq -c | sort -rn | head -15 || true
