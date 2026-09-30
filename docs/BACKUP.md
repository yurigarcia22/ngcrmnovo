# Backup do CRM NG

Até 29/09/2026 o CRM não tinha backup nenhum (o plano grátis da Supabase não faz).
Desde 30/09/2026 roda um backup diário fora da Supabase e fora do VPS.

## O que é copiado

| O quê | Como | Onde fica | Por quanto tempo |
|---|---|---|---|
| Banco inteiro (todas as tabelas, `auth.users`, funções, RLS, jobs do pg_cron) | `pg_dump -Fc` com o usuário `backup_leitura` (só leitura) | Backblaze B2, bucket `crm-ng-backup`, pasta `banco/` | 30 dias visível + 10 dias oculto, apagado sozinho pela regra do bucket |
| Mídias do WhatsApp (bucket `crm-media` do Storage) | espelho em `/opt/crm-backup/midia` no VPS, depois `rclone copy` | mesmo bucket, pasta `midia/` | para sempre (nada é apagado) |

Fica de fora: histórico do pg_cron e respostas do pg_net (descartáveis). Também não entra aqui:
segredos das Edge Functions, variáveis do Easypanel, banco da Evolution e o n8n (ver "Lacunas").

## Como funciona

- Cron no VPS: `/etc/cron.d/crm-backup`, todo dia às 03h30 de Brasília (06h30 UTC).
- Script: `/opt/crm-backup/backup.sh` (fonte versionada em `scripts/backup/`).
- Log: `/var/log/crm-backup.log` (logrotate mensal, 12 meses). Último sucesso: `/opt/crm-backup/ultimo_ok.txt`.
- Segredos do servidor: `/opt/crm-backup/.env` (chmod 600, só root). Modelo em `scripts/backup/env.exemplo`.
- Avisos no Telegram (bot do Maximus): 🔴 em qualquer falha, 🟢 toda segunda com o resumo da semana.

Três travas de segurança:

1. **O dump é criptografado com `age` antes de sair do VPS.** O servidor só tem a chave PÚBLICA
   (`destinatario.txt`): tranca, mas não abre. A chave privada está no `credentials.md`, seção
   "CRM NG: Backup diário (Backblaze B2)". **Sem ela nenhum backup abre.** Guardar também fora do PC.
2. **A chave do B2 que está no VPS não pode apagar nada** (só listar, ler e gravar, e só nesse bucket).
   Quem invadir o servidor não consegue sumir com os backups. A chave mestra da conta fica só no `credentials.md`.
3. **O dump é conferido antes do envio**: tamanho mínimo e presença das tabelas `deals`, `messages`,
   `contacts`, `auth.users` e `storage.objects`.

## Testar se o backup volta

Do PC, com a chave privada num arquivo (uma linha `AGE-SECRET-KEY-1...`):

```bash
ssh crm-vps /opt/crm-backup/restaurar_teste.sh < chave_privada.txt
```

Baixa o backup mais recente, abre com a chave (só em memória, nunca gravada no VPS), restaura num
Postgres descartável sem rede e compara a contagem de linhas de todas as tabelas com a produção.
Primeiro teste (30/09/2026): 76 tabelas, 305.628 linhas no backup contra 305.629 em produção.
Os ~10 erros de `pg_cron`, `pg_net` e `supabase_vault` são esperados: essas extensões só existem
na Supabase. Refazer o teste uma vez por mês.

## Restaurar de verdade (desastre)

1. **Baixar**: pelo site do Backblaze (bucket `crm-ng-backup` > `banco/`) ou com rclone usando a chave mestra.
2. **Abrir**: `age -d -i chave_privada.txt -o crm.dump crm_AAAA-MM-DD_HHMM.dump.age`
3. **Restaurar num Supabase novo** (nuvem ou o nosso no VPS). O destino já vem com `auth`, `storage`
   e as extensões, então a estrutura do `public` vai inteira e o resto vai só em dados:

   ```bash
   # estrutura + dados do CRM
   pg_restore --no-owner --no-acl -n public -d "$DESTINO" crm.dump
   # usuários e mídias (o destino já tem as tabelas)
   pg_restore --no-owner --no-acl --data-only -n auth -t users -t identities -d "$DESTINO" crm.dump
   pg_restore --no-owner --no-acl --data-only -n storage -t buckets -t objects -d "$DESTINO" crm.dump
   # jobs agendados (pg_cron)
   pg_restore --no-owner --no-acl --data-only -n cron -t job -d "$DESTINO" crm.dump
   ```

   Gatilhos que o `public` pendura em tabelas do `auth` precisam ser recriados à parte
   (`pg_restore -l crm.dump | grep TRIGGER` mostra quais).
4. **Mídias**: subir a pasta `midia/` do B2 para o Storage do destino, no bucket `crm-media`, mantendo os caminhos.
5. **Religar**: variáveis do CRM no Easypanel, webhooks da Evolution, segredos das Edge Functions, URLs das crons.

O passo a passo fino (ordem, gatilhos, Storage) vai ser validado de ponta a ponta na migração para
o Supabase próprio no VPS (etapa 2) e este documento atualizado com o que der diferente.

## Lacunas conhecidas

- **Segredos das Edge Functions** (OpenAI, chave do lote, CRON_KEY etc.): estão na Supabase e no
  `credentials.md`, não no dump.
- **Banco da Evolution, Redis e n8n** vivem no VPS e não entram aqui. Perder o VPS significa
  reconectar o WhatsApp dos clientes (QR code) e refazer os fluxos do n8n.
- **O backup depende do IPv6 do VPS**: a conexão direta da Supabase é só IPv6. Se falhar, o aviso
  🔴 chega e dá para trocar `PGHOST` pelo pooler em modo sessão.
