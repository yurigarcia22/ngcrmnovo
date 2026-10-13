# Supabase do CRM no VPS

Instalada em 13/10/2026 no VPS da Hostinger (187.77.248.111, `ssh crm-vps`). Plano completo em
`docs/MIGRACAO-SUPABASE-VPS.md`. Senhas e chaves no `credentials.md` (seção "CRM NG: Supabase no VPS").

## Onde está cada coisa

| O quê | Onde |
|---|---|
| Compose oficial da Supabase (commit `9e05961` de 13/10/2026) | `/opt/supabase/docker-compose.yml` |
| Nossos ajustes | `/opt/supabase/docker-compose.ngcrm.yml` (cópia aqui) |
| Segredos | `/opt/supabase/.env` (chmod 600; `COMPOSE_FILE=docker-compose.yml:docker-compose.ngcrm.yml`) |
| Rota pública | `/etc/easypanel/traefik/config/ngcrm-supabase.yaml` (cópia aqui como `traefik-ngcrm-supabase.yaml`) |
| Funções | `/opt/supabase/volumes/functions/<nome>/index.ts` |
| Banco | volume Docker do serviço `db` |
| Arquivos do Storage | `/opt/supabase/volumes/storage` |

## O que mudamos em relação ao oficial

- `gotrue:v2.197.0` e `storage-api:v1.81.3`: o compose oficial veio com versões mais velhas que a nuvem.
- Nenhuma porta publicada no host: o gateway (Envoy, container `supabase-envoy`) entra na rede `easypanel`
  e o Traefik do Easypanel roteia `api.grupong.online` pra ele, com HTTPS.
- `supavisor` (pooler) desligado: abriria 5432/6543 pra internet e não usamos.
- Postgres com `shared_buffers=256MB`, `effective_cache_size=1GB` e teto de memória por serviço.
- `volumes/functions/main/index.ts`: `memoryLimitMb` de 150 pra 256, igual à nuvem. **Reaplicar depois de
  atualizar a Supabase** (`update.sh` pode trazer o arquivo original de volta).
- O mesmo arquivo do Traefik também publica `painel.grupong.online` (painel do Easypanel com HTTPS).

## Operação

```bash
ssh crm-vps
cd /opt/supabase
sh run.sh status            # situação dos serviços
sh run.sh logs functions    # logs de um serviço
sh run.sh restart functions # reiniciar um serviço (ex.: depois de copiar função nova)
docker exec -it supabase-db psql -U postgres   # SQL direto no banco
```

Medido na primeira subida: os 10 serviços usam ~1 GB de RAM com o banco vazio.
