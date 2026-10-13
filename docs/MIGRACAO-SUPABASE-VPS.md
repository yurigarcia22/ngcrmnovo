# Migração da Supabase (nuvem) para Supabase no nosso VPS

Plano v1, 10/10/2026. Levantamento feito direto na produção (Supabase, VPS, Evolution, n8n e código).

## Andamento

| Data | Feito |
|---|---|
| 10/10 | Pausa de imagem e vídeo (`PAUSAR_MIDIA`); Storage parou de crescer (806 MB em 13/10) |
| 13/10 | DNS `api` e `painel` no Cloudflare (via API); snapshot do VPS (via API da Hostinger; vale 24 h) |
| 13/10 | Código da fase 1: rotas de cron pela configuração, link público da mídia, `/api/health` |
| 13/10 | **Fase 2 concluída:** Supabase no VPS (`infra/supabase-vps/`), ~1 GB de RAM, `https://api.grupong.online` com certificado. Testado: login (criar, entrar, sessão), API com RLS, Storage com link público, tempo real (broadcast e mudança de linha chegando na hora), função chamada sem chave (como a Evolution), painel só com senha, portas 5432/6543/8000 fechadas pra internet |
| 13/10 | `painel.grupong.online` com HTTPS funcionando (falta fechar a porta 3000 no firewall) |

Pendências da fase 1: firewall da Hostinger, SSH só por chave, monitor de queda (UptimeRobot), deploy do CRM com a `/api/health`.

## Por que agora

- **Storage em 803 MB de 1 GB** no plano grátis, crescendo uns 45 MB por dia (dois terços são vídeos,
  a maior parte da Animal Care). No ritmo de outubro, passa de 1 GB em 4 ou 5 dias.
- Banco em 268 MB de 500 MB (era 174 MB em 29/09).
- A Supabase avisa quando o projeto grátis passa do limite, dá um prazo de tolerância (sem dizer quantos dias)
  e depois pode restringir: banco só leitura, projeto pausado ou **toda chamada respondendo erro 402**.
  Esse prazo só acontece uma vez.
- O banco Nano (0,5 GB de RAM) já caiu duas vezes em setembro.
- O painel da Supabase mostra o projeto como "RESTARTING" desde o reinício de 29/09. Os serviços estão
  saudáveis, é só o rótulo que travou.

## O que existe hoje (inventário)

| Peça | Situação |
|---|---|
| Projeto | NGCRM, organização "NG CRM" (só ele), São Paulo, Postgres 17.6.1.054, plano grátis, Nano |
| Extensões | pg_cron, pg_net, pg_stat_statements, pgcrypto, supabase_vault (vazio), uuid-ossp |
| Crons (12) | 5 chamam o próprio CRM (`crm.grupong.online/api/cron/*`), 4 chamam funções da Supabase (ai-analyze, ai-daily, ai-transcribe, meta-capi), 3 são SQL puro |
| Funções (5) | ai-analyze, ai-daily, ai-transcribe, meta-capi, webhook-evolution. Todas sem exigir JWT |
| Segredos das funções | AI_CRON_KEY, AI_LOTE_KEY, EVOLUTION_API_TOKEN, EVOLUTION_API_URL, OPENAI_API_KEY |
| Login | 12 usuários, só e-mail e senha, sem SMTP próprio (o e-mail de recuperação já não chega pra cliente hoje), sem MFA em uso |
| Chaves usadas pelo CRM | anon e service_role no formato antigo (JWT) |
| Tempo real | 7 tabelas (contacts, deal_tags, deals, messages, notifications, stages, tasks), usadas em 6 telas |
| Storage | 1 bucket público `crm-media`, 3.587 arquivos, 803 MB. Espelho completo já existe no VPS (`/opt/crm-backup/midia`) |
| Links gravados no banco | 3.486 com o endereço da nuvem: `messages.media_url` 2.655, `contacts.photo_url` 829, `quick_replies.media_url` 2 |
| Quem escreve no banco de fora | Evolution (7 WhatsApps do CRM no webhook-evolution), n8n (4 fluxos ativos de lead: Meta, TikTok, Machado 2.0, VET SEM LC; 2 credenciais Supabase + 1 Postgres), Hermes (API de lote), o próprio CRM |
| Endereço da nuvem escrito no código | `api/cron/webhook-retry` e `api/cron/whatsapp-reconcile` (fixo), `scripts/hermes/ia_lote.py` (padrão) |
| VPS | 8 GB de RAM (4,5 GB livres), swap 4 GB, 41 GB de disco livres, firewall desligado, portas 3000 (painel Easypanel) e 2377/7946 (Docker) abertas pra internet, SSH aceita senha |
| DNS | grupong.online no Cloudflare; `crm`, `evo` e `n8n` apontam pro VPS (187.77.248.111) |

## Como vai ficar

- Supabase rodando no mesmo VPS, como um app **Compose** no Easypanel (aparece no painel, com logs e
  reinício pela tela), com o compose oficial da Supabase **fixado em Postgres 17** (o mesmo da nuvem).
- Sem os serviços pesados que não usamos: analytics (Logflare), vector, imgproxy e o pooler.
- Endereço público: `api.grupong.online` (HTTPS pelo Traefik do Easypanel). A porta do Postgres não fica
  aberta pra internet.
- Banco com teto de memória de 1,5 GB. Estimativa da Supabase inteira: 1,5 a 2 GB de RAM.
- Mídias no disco do VPS (backend de arquivo da Supabase). Disco aguenta uns 2 anos no ritmo atual.
- Backup continua no Backblaze, criptografado, agora do banco local (proposta: 4 vezes por dia) e das mídias.

## Fases

### Fase 0: ponte (decisão)

**Decidido em 10/10/2026: opção B com pausa de imagem e vídeo.** Desde 10/10 às 23h57 o `webhook-evolution`
(v58) não baixa imagem nem vídeo (segredo `PAUSAR_MIDIA=imagem,video`). A mensagem entra normal, com a
legenda ou o aviso "[Imagem não salva]" / "[Vídeo não salvo]". Áudio (a IA transcreve), PDF, figurinha e foto
de perfil continuam sendo salvos. O crescimento cai de ~270 MB pra ~66 MB por semana, uns 20 dias de folga.
Pra voltar a salvar tudo: apagar o segredo `PAUSAR_MIDIA`. Se precisar de mais folga, `PAUSAR_MIDIA=imagem,video,documento`.

- **Opção A (recomendada):** Supabase Pro por 1 mês (US$ 25, só a organização do CRM é afetada).
  Some o limite de 1 GB e de 500 MB, o banco sobe de Nano pra Micro (pode reiniciar 1 ou 2 minutos na troca)
  e a migração anda sem pressa. Cancela depois da virada.
- **Opção B:** sem pagar. Virada em 4 dias. Se o Storage chegar perto de 1 GB antes, pausamos o
  salvamento de vídeo no CRM por alguns dias (a mensagem chega, só o vídeo não fica salvo).

### Fase 1: preparação sem risco (meio dia)

1. DNS no Cloudflare: `api.grupong.online` tipo A pro 187.77.248.111, nuvem cinza (só DNS), igual aos outros.
2. Foto (snapshot) do VPS na Hostinger antes de mexer.
3. Segurança do VPS, antes de o banco morar lá:
   - painel do Easypanel num endereço com HTTPS (ex.: `painel.grupong.online`);
   - firewall da Hostinger (hPanel) liberando só 22, 80 e 443. O `ufw` não serve: o Docker passa por cima dele;
   - SSH só por chave (senha desligada).
4. Ajustes de código (sobem antes, sem mudar nada em produção):
   - as duas rotas de cron leem o endereço da configuração em vez de fixo;
   - o `webhook-evolution` monta o link público da mídia com `SUPABASE_PUBLIC_URL` (no VPS a função enxerga
     um endereço interno, que o navegador não abre). Sem a variável, continua como hoje;
   - rota `/api/health` no CRM, que testa o banco, pro monitor de queda.
5. Monitor de queda externo (UptimeRobot grátis, aviso no Telegram): CRM, banco/API e Evolution.
   Precisa ser de fora: se o VPS cair, nada dentro dele avisa.

### Fase 2: Supabase vazia no VPS (meio dia)

1. Compose oficial com as imagens **iguais ou mais novas que as da nuvem**. Trava: login (GoTrue) com
   migração ≥ 20260831180000, storage com migração ≥ 72, Postgres 17.6.
   Conferido em 13/10/2026: o compose oficial vem com `supabase/postgres:17.6.1.136` (ok), mas com
   `gotrue:v2.196.0` (última migração 20260625, **mais velha que a nuvem**) e `storage-api:v1.74.0`
   (69 migrações, **mais velha**). Usar `supabase/gotrue:v2.197.0` (estável, termina exatamente em
   20260831180000) e `supabase/storage-api:v1.81.3` (74 migrações, inclui a 72). O gateway agora é Envoy
   (`api-gw`, apelido `kong`), e o analytics não vem mais no compose base. Tirar do compose: as portas
   publicadas no host (8000 do `api-gw`, 5432 e 6543 do `supavisor`), o `supavisor` e o `imgproxy`.
2. Gerar segredos novos (JWT, anon, service_role, senha do Postgres, senha do painel, chaves internas)
   e guardar no `credentials.md`.
3. Funções copiadas do repositório, `VERIFY_JWT=false` (as 5 já são assim), segredos no ambiente.
4. Subir, medir RAM e testar vazio: saúde, login de teste, upload, tempo real e função de teste.

### Fase 3: ensaio 1 com cópia da produção (1 dia)

1. Copiar o banco pelo método oficial da Supabase (papéis, estrutura e dados separados), usando o usuário
   só leitura `backup_leitura`. Tabelas do pg_cron e o Storage ficam de fora da cópia.
2. **Crons desligados no ensaio.** Ligados, a cópia mandaria evento em dobro pra Meta, analisaria conversa
   em dobro e dispararia mensagens.
3. Subir as ~3.600 mídias a partir do espelho que já está no VPS, mantendo os caminhos.
   Reescrever os 3.486 links (`replace` do endereço da nuvem pelo novo; conferir se algum é link assinado).
4. **CRM de teste** (segundo serviço no Easypanel, ex. `crm-teste.grupong.online`) apontando pro banco
   novo e **sem o token da Evolution**, pra não mandar mensagem de verdade pra cliente. Você navega:
   login, chat, leads, Inteligência, agenda, mídia, tempo real.
5. Testar o webhook novo com tráfego real: reenviar payloads guardados em `webhook_events` e conferir
   que grava igual à nuvem.
6. Medir tempos (cópia, restauração, upload) e RAM.

### Fase 4: ensaio 2 cronometrado (meio dia)

Refazer do zero com o roteiro final em script. O resultado é o passo a passo da virada com o tempo de cada etapa.

### Fase 5: virada (uma noite, ~1 hora, você online pra clicar o deploy)

| Quando | Passo |
|---|---|
| T-30 min | Snapshot do VPS. Espelho de mídia atualizado e upload do que entrou desde o ensaio |
| T0 | Pausar os crons da nuvem e o Hermes. Marcar o horário T0 |
| T0 | Cópia final da nuvem pro banco novo (limpo). Reescrever links. Recriar os 12 crons com endereços novos e ligar |
| T+20 | Trocar: 7 webhooks da Evolution (script), 2 credenciais do n8n, URL do Hermes, variáveis do CRM no Easypanel e **deploy** |
| T+30 | Reenviar ao webhook novo tudo o que chegou na nuvem depois de T0 (`webhook_events`). Conferir leads do n8n no intervalo |
| T+35 | Nuvem em **só leitura pro app** (aba aberta da noite anterior não grava no banco velho). Equipe dá F5 de manhã |
| T+40 | Teste de fumaça: login, chat em tempo real, receber e mandar mensagem de teste, mídia abre, IA roda, fila da Meta, crons rodando |
| T+60 | Backup aponta pro banco local; teste de restauração do primeiro backup novo |

**Critério de volta:** se o teste de fumaça falhar em algo que não se corrige em 30 minutos, voltamos
webhooks, n8n, Hermes e variáveis do CRM pra nuvem, religamos os crons de lá e reenviamos pra nuvem o
que entrou no banco novo (mesmo mecanismo do `webhook_events`, ao contrário).

Talvez a equipe precise entrar de novo no CRM uma vez (login e senha continuam os mesmos).

### Fase 6: duas semanas depois

- A nuvem fica parada como plano B (sem crons, sem receber nada).
- Acompanhar RAM, disco e backup. Fazer um teste de restauração completo.
- Backup final da nuvem e cancelamento do Pro (ou pausa do projeto).
- Minhas ferramentas trocam a API da Supabase por SSH: SQL via `psql` no container e deploy de função por cópia.
- Apagar o `PAUSAR_MIDIA` no servidor novo (volta a salvar imagem e vídeo) e **tentar recuperar** as imagens e
  vídeos do período pausado: mensagens `image`/`video` sem `media_url` desde 10/10, baixadas de novo pela Evolution
  (`getBase64FromMediaMessage`). Funciona enquanto o WhatsApp ainda guarda o arquivo, por isso o quanto antes.

## Riscos e o que fazemos com cada um

| Risco | Tratamento |
|---|---|
| VPS cai e leva tudo junto | Já é assim hoje pro CRM e a Evolution. Backup 4x/dia criptografado fora do VPS, snapshot da Hostinger, monitor externo, restauração documentada |
| Versão das imagens mais velha que a nuvem (login, storage) | Trava na Fase 2 e conferência no ensaio |
| Tempo real atrás do proxy | Testado no ensaio, nas 6 telas que usam |
| Falta de RAM | Teto por container, swap de 4 GB, medição no ensaio; painel da Supabase só quando precisar, se apertar |
| Mensagens no meio da virada | Reenvio pelo `webhook_events` (o webhook é idempotente pelo id da mensagem) |
| Aba velha gravando no banco antigo | Nuvem em só leitura depois da virada |
| Atualização e segurança do Supabase por nossa conta | Janela de manutenção mensal pra atualizar as imagens |

## Custos

| | Por mês |
|---|---|
| Hoje (grátis, no limite) | R$ 0, com risco de restrição |
| Ficar na Supabase sem cair (Pro + máquina maior) | ~US$ 40 (~R$ 230) |
| Supabase no VPS | R$ 0 a mais (o VPS de R$ 43,99 já é pago). Backblaze grátis até 10 GB; depois disso, centavos por GB |
| Ponte opcional | US$ 25 uma vez |
