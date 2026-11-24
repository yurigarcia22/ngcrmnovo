-- Metas de execucao (24/11/2026).
-- A meta passa a ter alvo por DIA e por SEMANA (ligacao, decisor, reuniao marcada,
-- reuniao feita, proposta, contrato), alem do mes. Reuniao conta do cold call E do
-- disparo. Proposta conta quando a deal entra numa etapa marcada como "Proposta".
-- Marcos (contratos acumulados e faturamento ate uma data) ficam em goal_plans.

-- 1) Alvos por dia e por semana na linha da meta (uma linha por mes; o painel usa a
--    linha mais recente para dia/semana enquanto ninguem cadastrar a do mes novo).
alter table public.goals
  add column if not exists day_calls          integer not null default 0,
  add column if not exists day_decisors       integer not null default 0,
  add column if not exists day_meetings       integer not null default 0,
  add column if not exists day_meetings_done  integer not null default 0,
  add column if not exists week_calls         integer not null default 0,
  add column if not exists week_meetings      integer not null default 0,
  add column if not exists week_meetings_done integer not null default 0,
  add column if not exists week_proposals     integer not null default 0,
  add column if not exists week_contracts     integer not null default 0;

-- 2) Plano com marcos (um por tenant).
--    milestones = [{ "due": "2026-12-31", "contracts": 10, "revenue": 50000 }, ...]
--    contracts = contratos novos acumulados desde start_date; revenue = faturamento/mes
--    esperado (base_revenue + valor das deals ganhas desde start_date).
create table if not exists public.goal_plans (
  tenant_id    uuid primary key references public.tenants(id) on delete cascade,
  start_date   date not null,
  base_revenue numeric not null default 0,
  milestones   jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);
alter table public.goal_plans enable row level security;
drop policy if exists "goal_plans_tenant_isolation" on public.goal_plans;
create policy "goal_plans_tenant_isolation" on public.goal_plans
  for all
  using (tenant_id in (select tenant_id from public.profiles where id = auth.uid()))
  with check (tenant_id in (select tenant_id from public.profiles where id = auth.uid()));

-- 3) Etapa de proposta e funil que conta na meta.
alter table public.stages    add column if not exists is_proposal boolean not null default false;
alter table public.pipelines add column if not exists in_goals    boolean not null default true;

-- GRUPO NG: "Proposta Enviada" do Funil de Vendas; o Funil Flavio | PenseFar e do
-- cliente (lead do Meta Ads dele), nao entra na meta do Grupo NG.
update public.stages    set is_proposal = true where id = 3  and tenant_id = '00000000-0000-0000-0000-000000000000';
update public.pipelines set in_goals = false   where id = 38 and tenant_id = '00000000-0000-0000-0000-000000000000';

-- 4) Quem marcou a reuniao no disparo (pra meta por vendedor).
alter table public.dispatch_recipients add column if not exists meeting_marked_by uuid;

-- 5) Historico de etapa das deals (o CRM so guardava a etapa atual).
create table if not exists public.deal_stage_events (
  id          bigserial primary key,
  tenant_id   uuid not null,
  deal_id     uuid not null references public.deals(id) on delete cascade,
  from_stage  bigint,
  to_stage    bigint not null,
  changed_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_deal_stage_events_tenant_time on public.deal_stage_events (tenant_id, created_at);
create index if not exists idx_deal_stage_events_deal on public.deal_stage_events (deal_id);
alter table public.deal_stage_events enable row level security;
drop policy if exists "deal_stage_events_tenant_read" on public.deal_stage_events;
create policy "deal_stage_events_tenant_read" on public.deal_stage_events
  for select
  using (tenant_id in (select tenant_id from public.profiles where id = auth.uid()));

-- Nunca bloqueia a gravacao da deal: se o log falhar, segue sem ele.
create or replace function public.deals_log_stage_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.stage_id is not null and NEW.tenant_id is not null
     and (TG_OP = 'INSERT' or NEW.stage_id is distinct from OLD.stage_id) then
    begin
      insert into public.deal_stage_events (tenant_id, deal_id, from_stage, to_stage, changed_by)
      values (NEW.tenant_id, NEW.id, case when TG_OP = 'UPDATE' then OLD.stage_id end, NEW.stage_id, auth.uid());
    exception when others then
      null;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_deals_log_stage_event on public.deals;
create trigger trg_deals_log_stage_event
  after insert or update of stage_id on public.deals
  for each row execute function public.deals_log_stage_event();

-- 6) Realizado da meta: uma linha por (vendedor, metrica) com o total de HOJE, da
--    SEMANA (segunda a domingo) e do MES, no horario de Brasilia.
--    Metricas: calls, decisors, meetings, meetings_done, proposals, contracts,
--    revenue, dispatched, replies, replies_pending (respostas de gente ao disparo
--    nos ultimos 7 dias que ainda nao tiveram resposta nossa; vem igual nas 3 colunas).
create or replace function public.goals_execution(p_tenant uuid, p_now timestamptz default now())
returns table (user_id uuid, metric text, d numeric, w numeric, m numeric)
language sql stable security definer set search_path = public as $$
  with lo as (
    select d0, w0, m0, least(w0, m0) as t0
      from (select (date_trunc('day',   p_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as d0,
                   (date_trunc('week',  p_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as w0,
                   (date_trunc('month', p_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as m0) x
  ),
  cold as (
    select n.created_by as uid, n.created_at as ts,
           trim(regexp_replace(n.content, '^Interação Registrada:', '', 'i')) as res
      from cold_lead_notes n
      join cold_leads l on l.id = n.cold_lead_id
      cross join lo
     where l.tenant_id = p_tenant
       and n.content ilike 'Interação Registrada:%'
       and n.created_at >= lo.t0 and n.created_at <= p_now
  ),
  dbase as (
    select r.id, r.phone, r.sent_at, c.instance_name, c.created_by as uid
      from dispatch_recipients r
      join dispatch_campaigns c on c.id = r.campaign_id
      cross join lo
     where r.tenant_id = p_tenant and c.tenant_id = p_tenant
       and r.status = 'sent'
       and r.sent_at >= least(lo.t0, lo.d0 - interval '7 days') - interval '15 days'
       and r.sent_at <= p_now
  ),
  dinb as (
    select b.id as rid, b.uid, ct.id as contact_id, m.created_at,
           public.dispatch_is_auto_reply(m.content, extract(epoch from (m.created_at - b.sent_at))) as is_auto
      from dbase b
      join contacts ct on ct.tenant_id = p_tenant
                      and regexp_replace(coalesce(ct.phone, ''), '\D', '', 'g') = any (public.br_phone_variants(b.phone))
      join messages m on m.contact_id = ct.id
                     and m.tenant_id = p_tenant
                     and m.direction = 'inbound'
                     and m.created_at > b.sent_at
                     and m.created_at <= p_now
                     and (m.instance_name is null or m.instance_name = b.instance_name)
  ),
  rep as (
    select rid, uid, (array_agg(contact_id order by created_at))[1] as contact_id, min(created_at) as replied_at
      from dinb where not is_auto
     group by rid, uid
  ),
  prop as (
    select x.deal_id, min(x.ts) as ts
      from (
        select e.deal_id, e.created_at as ts
          from deal_stage_events e
          join stages s on s.id = e.to_stage
          join pipelines pp on pp.id = s.pipeline_id
          cross join lo
         where e.tenant_id = p_tenant and s.is_proposal and pp.in_goals
           and e.created_at >= lo.t0 and e.created_at <= p_now
        union all
        -- deals que ja estavam na etapa de proposta antes do historico existir
        select dd.id, dd.stage_entered_at
          from deals dd
          join stages s on s.id = dd.stage_id
          join pipelines pp on pp.id = s.pipeline_id
          cross join lo
         where dd.tenant_id = p_tenant and s.is_proposal and pp.in_goals
           and dd.stage_entered_at >= lo.t0 and dd.stage_entered_at <= p_now
      ) x
     group by x.deal_id
  ),
  won as (
    select dd.owner_id as uid, dd.closed_at as ts, coalesce(dd.value, 0) as value
      from deals dd
      join stages s on s.id = dd.stage_id
      join pipelines pp on pp.id = s.pipeline_id
      cross join lo
     where dd.tenant_id = p_tenant and dd.status = 'won' and pp.in_goals
       and dd.closed_at >= lo.t0 and dd.closed_at <= p_now
  ),
  ev as (
    select uid, ts, 'calls'::text as metric, 1::numeric as v from cold
     where res in ('ligacao_feita', 'contato_realizado', 'contato_decisor', 'reuniao_marcada', 'convertido', 'descartado', 'sem_interesse', 'numero_inexistente')
    union all
    select uid, ts, 'decisors', 1 from cold where res in ('contato_decisor', 'reuniao_marcada', 'convertido')
    union all
    select uid, ts, 'meetings', 1 from cold where res = 'reuniao_marcada'
    union all
    select coalesce(r.meeting_marked_by, c.created_by), r.meeting_marked_at, 'meetings', 1
      from dispatch_recipients r join dispatch_campaigns c on c.id = r.campaign_id cross join lo
     where r.tenant_id = p_tenant and r.meeting_marked_at >= lo.t0 and r.meeting_marked_at <= p_now
    union all
    select coalesce(n.created_by, o.created_by), coalesce(o.meeting_at, o.created_at), 'meetings_done', 1
      from cold_meeting_outcomes o left join cold_lead_notes n on n.id = o.note_id cross join lo
     where o.tenant_id = p_tenant and o.outcome = 'aconteceu'
       and coalesce(o.meeting_at, o.created_at) >= lo.t0 and coalesce(o.meeting_at, o.created_at) <= p_now
    union all
    select coalesce(r.meeting_marked_by, c.created_by), coalesce(r.meeting_at, r.meeting_marked_at), 'meetings_done', 1
      from dispatch_recipients r join dispatch_campaigns c on c.id = r.campaign_id cross join lo
     where r.tenant_id = p_tenant and r.meeting_outcome = 'aconteceu' and r.meeting_marked_at is not null
       and coalesce(r.meeting_at, r.meeting_marked_at) >= lo.t0 and coalesce(r.meeting_at, r.meeting_marked_at) <= p_now
    union all
    select dd.owner_id, p.ts, 'proposals', 1 from prop p join deals dd on dd.id = p.deal_id
    union all
    select uid, ts, 'contracts', 1 from won
    union all
    select uid, ts, 'revenue', value from won
    union all
    select b.uid, b.sent_at, 'dispatched', 1 from dbase b cross join lo where b.sent_at >= lo.t0
    union all
    select uid, replied_at, 'replies', 1 from rep cross join lo where replied_at >= lo.t0
    union all
    select r.uid, p_now, 'replies_pending', 1
      from rep r cross join lo
     where r.replied_at >= lo.d0 - interval '7 days'
       and not exists (
         select 1 from messages mo
          where mo.contact_id = r.contact_id and mo.tenant_id = p_tenant
            and mo.direction = 'outbound' and mo.created_at > r.replied_at)
  )
  select e.uid, e.metric,
         coalesce(sum(e.v) filter (where e.ts >= lo.d0), 0),
         coalesce(sum(e.v) filter (where e.ts >= lo.w0), 0),
         coalesce(sum(e.v) filter (where e.ts >= lo.m0), 0)
    from ev e cross join lo
   group by e.uid, e.metric;
$$;

revoke all on function public.goals_execution(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.goals_execution(uuid, timestamptz) to service_role;

-- 7) Contratos e valor ganho desde uma data (marcos do plano).
create or replace function public.goals_won_since(p_tenant uuid, p_since timestamptz)
returns table (contracts bigint, revenue numeric)
language sql stable security definer set search_path = public as $$
  select count(*), coalesce(sum(coalesce(dd.value, 0)), 0)
    from deals dd
    join stages s on s.id = dd.stage_id
    join pipelines pp on pp.id = s.pipeline_id
   where dd.tenant_id = p_tenant and dd.status = 'won' and pp.in_goals
     and dd.closed_at >= p_since;
$$;

revoke all on function public.goals_won_since(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.goals_won_since(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
