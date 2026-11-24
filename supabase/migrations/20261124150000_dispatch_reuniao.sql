-- Disparo: marcar reuniao no contato que respondeu, pra contar no painel de desempenho
-- (qual mensagem gera reuniao, nao so resposta).
alter table public.dispatch_recipients add column if not exists meeting_marked_at timestamptz; -- quando marcou (nao nulo = tem reuniao)
alter table public.dispatch_recipients add column if not exists meeting_at timestamptz;        -- data/hora da reuniao (opcional)
create index if not exists idx_dispatch_recipients_meeting
  on public.dispatch_recipients (campaign_id) where meeting_marked_at is not null;

-- Resultado da reuniao (mesmo vocabulario do cold call / cold_meeting_outcomes):
-- null = agendada (ainda nao aconteceu), aconteceu, no_show, cancelada.
alter table public.dispatch_recipients add column if not exists meeting_outcome text;
alter table public.dispatch_recipients drop constraint if exists dispatch_recipients_meeting_outcome_chk;
alter table public.dispatch_recipients add constraint dispatch_recipients_meeting_outcome_chk
  check (meeting_outcome is null or meeting_outcome in ('aconteceu', 'no_show', 'cancelada'));
