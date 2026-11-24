-- Revisao do Cold Call (23/11/2026)
-- 1. status passa a ser derivado da etapa no banco (um caminho so, vale pra kanban,
--    acao rapida, PATCH, importacao e edicao em massa)
-- 2. lead sem etapa entra na etapa de entrada do funil de cold call padrao
-- 3. telefone gravado sempre no formato canonico (55 + DDD + numero)
-- 4. conversao em venda: um caminho so (este trigger), sem duplicar contato/deal,
--    replicando as notas e guardando o deal criado em converted_deal_id
-- 5. tenant_id do lead nao pode ser trocado por UPDATE
-- 6. reserva do lead aberto (locked_by/locked_at) e incremento atomico de tentativas
-- 7. notas: remove as policies que liberavam INSERT/UPDATE pra qualquer um

-- ---------------------------------------------------------------------------
-- Telefone canonico (espelho de frontend/lib/phone.ts normalizeToCanonical)
-- ---------------------------------------------------------------------------
create or replace function public.br_phone_canonical(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if length(d) = 11 then return '55' || d; end if;
  if length(d) = 10 then
    if substr(d, 3, 1) ~ '[6-9]' then return '55' || substr(d, 1, 2) || '9' || substr(d, 3); end if;
    return '55' || d;
  end if;
  if length(d) = 13 and left(d, 2) = '55' then return d; end if;
  if length(d) = 12 and left(d, 2) = '55' then
    if substr(d, 5, 1) ~ '[6-9]' then return left(d, 4) || '9' || substr(d, 5); end if;
    return d;
  end if;
  return d;
end $$;

create or replace function public.br_phone_variants(p text)
returns text[] language plpgsql immutable as $$
declare c text := public.br_phone_canonical(p);
        d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
        v text[] := array[c, d];
begin
  if left(c, 2) = '55' and length(c) in (12, 13) then v := v || substr(c, 3); end if;
  if length(c) = 13 and substr(c, 5, 1) = '9' then
    v := v || (left(c, 4) || substr(c, 6)) || (substr(c, 3, 2) || substr(c, 6));
  end if;
  return array(select distinct x from unnest(v) x where x <> '');
end $$;

-- ---------------------------------------------------------------------------
-- Status a partir da etapa
-- ---------------------------------------------------------------------------
create or replace function public.cold_status_for_stage(
  p_name text, p_is_won boolean, p_is_lost boolean, p_is_inbox boolean, p_current text)
returns text language plpgsql immutable as $$
declare n text := lower(translate(coalesce(p_name, ''),
  'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
  'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'));
begin
  if n like '%inexist%' or n like '%invalid%' or n like '%sem whatsapp%' then return 'numero_inexistente'; end if;
  if coalesce(p_is_lost, false) then
    if p_current in ('perdido', 'sem_interesse', 'descartado', 'numero_inexistente') then return p_current; end if;
    return 'perdido';
  end if;
  if n like '%convertid%' then return 'convertido'; end if;
  if n like '%confirmad%' or n like '%reuni%' or n like '%agendad%' then return 'reuniao_marcada'; end if;
  if coalesce(p_is_won, false) then return 'convertido'; end if;
  if n like '%decisor%' then return 'contato_decisor'; end if;
  if n like '%contato%' then return 'contato_realizado'; end if;
  if n like '%tentativa 2%' then
    if p_current in ('em_follow_up', 'lead_qualificado', 'aguardando_retorno') then return p_current; end if;
    return 'em_follow_up';
  end if;
  if n like '%tentativa%' or n like '%ligac%' then
    if p_current in ('ligacao_feita', 'tentativa_inicial', 'nao_consegui_contato') then return p_current; end if;
    return 'ligacao_feita';
  end if;
  if coalesce(p_is_inbox, false) or n like 'novo%' then
    if p_current in ('novo', 'novo_lead') then return p_current; end if;
    return 'novo_lead';
  end if;
  return p_current;  -- etapa personalizada sem equivalente: mantem
end $$;

alter table public.cold_leads add column if not exists converted_deal_id uuid;
alter table public.cold_leads add column if not exists locked_by uuid;
alter table public.cold_leads add column if not exists locked_at timestamptz;

create or replace function public.cold_lead_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare st record;
begin
  if tg_op = 'UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id do cold_lead nao pode ser alterado' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or new.telefone is distinct from old.telefone then
    new.telefone := public.br_phone_canonical(new.telefone);
  end if;

  if tg_op = 'INSERT' and new.stage_id is null then
    select s.id into new.stage_id
      from stages s join pipelines p on p.id = s.pipeline_id
     where p.tenant_id = new.tenant_id and p.kind = 'cold_call'
     order by p.is_default desc nulls last, p.created_at, s.is_inbox desc nulls last, s.position
     limit 1;
  end if;

  if new.stage_id is not null and (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id) then
    select name, is_won, is_lost, is_inbox into st from stages where id = new.stage_id;
    new.status := public.cold_status_for_stage(st.name, st.is_won, st.is_lost, st.is_inbox, new.status);
  end if;
  return new;
end $$;

drop trigger if exists trg_cold_lead_sync on public.cold_leads;
create trigger trg_cold_lead_sync before insert or update on public.cold_leads
  for each row execute function public.cold_lead_sync();

-- ---------------------------------------------------------------------------
-- Conversao em venda (unico caminho). Roda depois do sync (ordem alfabetica dos
-- triggers BEFORE: trg_cold_lead_sync < trg_cold_lead_zconvert).
-- ---------------------------------------------------------------------------
create or replace function public.cold_lead_auto_convert_to_deal()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  won_check boolean;
  target_stage_id bigint;
  v_contact uuid;
  v_deal uuid;
  v_phone text;
  v_cv jsonb := '{}'::jsonb;
begin
  if new.stage_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then return new; end if;

  select s.is_won into won_check from stages s where s.id = new.stage_id;
  if won_check is not true then return new; end if;

  -- ja convertido e o deal segue aberto: nao duplica
  if new.converted_deal_id is not null
     and exists (select 1 from deals where id = new.converted_deal_id and status = 'open') then
    return new;
  end if;

  select s.id into target_stage_id
    from stages s join pipelines p on p.id = s.pipeline_id
   where p.tenant_id = new.tenant_id and p.kind = 'deals' and p.is_default = true
   order by s.is_inbox desc nulls last, s.position
   limit 1;
  if target_stage_id is null then return new; end if;

  v_phone := public.br_phone_canonical(new.telefone);
  select id into v_contact from contacts
   where tenant_id = new.tenant_id
     and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = any (public.br_phone_variants(new.telefone))
   order by (regexp_replace(coalesce(phone, ''), '\D', '', 'g') = v_phone) desc, created_at
   limit 1;
  if v_contact is null then
    insert into contacts (tenant_id, name, phone, email)
    values (new.tenant_id, coalesce(nullif(trim(new.nome), ''), v_phone), v_phone, new.email)
    returning id into v_contact;
  end if;

  select id into v_deal from deals
   where tenant_id = new.tenant_id and contact_id = v_contact and status = 'open'
   order by created_at desc limit 1;

  if v_deal is null then
    if new.custom_fields ? 'decisor_nome' then v_cv := v_cv || jsonb_build_object('responsible_name', new.custom_fields->>'decisor_nome'); end if;
    if new.custom_fields ? 'decisor_telefone' then v_cv := v_cv || jsonb_build_object('responsible_direct_phone', new.custom_fields->>'decisor_telefone'); end if;
    insert into deals (tenant_id, contact_id, stage_id, owner_id, title, status, value, custom_values)
    values (new.tenant_id, v_contact, target_stage_id, new.responsavel_id,
            coalesce(nullif(trim(new.nome), ''), v_phone), 'open', 0,
            case when v_cv = '{}'::jsonb then null else v_cv end)
    returning id into v_deal;

    insert into notes (deal_id, content, tenant_id, created_at)
    select v_deal, '[Histórico Cold Call]: ' || n.content, new.tenant_id, n.created_at
      from cold_lead_notes n where n.cold_lead_id = new.id order by n.created_at;
  end if;

  new.converted_deal_id := v_deal;
  return new;
end $$;

drop trigger if exists trg_cold_lead_auto_convert on public.cold_leads;
drop trigger if exists trg_cold_lead_zconvert on public.cold_leads;
create trigger trg_cold_lead_zconvert before insert or update on public.cold_leads
  for each row execute function public.cold_lead_auto_convert_to_deal();

-- ---------------------------------------------------------------------------
-- Reserva do lead (dois vendedores nao ligam pro mesmo lead) e tentativas atomicas
-- ---------------------------------------------------------------------------
create or replace function public.claim_cold_lead(p_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid := public.current_tenant_id();
        v_uid uuid := auth.uid();
        r record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem sessao'); end if;
  update cold_leads set locked_by = v_uid, locked_at = now()
   where id = p_lead_id and tenant_id = v_tenant
     and (locked_by is null or locked_by = v_uid or locked_at < now() - interval '10 minutes')
  returning id into r;
  if found then return jsonb_build_object('ok', true); end if;
  select l.locked_by, p.full_name into r
    from cold_leads l left join profiles p on p.id = l.locked_by
   where l.id = p_lead_id and l.tenant_id = v_tenant;
  if not found then return jsonb_build_object('ok', false, 'erro', 'lead nao encontrado'); end if;
  return jsonb_build_object('ok', false, 'locked_by', r.locked_by, 'locked_by_name', r.full_name);
end $$;

create or replace function public.release_cold_lead(p_lead_id uuid)
returns void language sql security definer set search_path = public as $$
  update cold_leads set locked_by = null, locked_at = null
   where id = p_lead_id and tenant_id = public.current_tenant_id() and locked_by = auth.uid();
$$;

create or replace function public.cold_lead_inc_tentativas(p_lead_id uuid, p_tenant_id uuid)
returns integer language sql security definer set search_path = public as $$
  update cold_leads set tentativas = coalesce(tentativas, 0) + 1
   where id = p_lead_id and tenant_id = p_tenant_id
  returning tentativas;
$$;

revoke all on function public.cold_lead_inc_tentativas(uuid, uuid) from anon, authenticated;
grant execute on function public.claim_cold_lead(uuid) to authenticated;
grant execute on function public.release_cold_lead(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notas: so a policy de isolamento por tenant
-- ---------------------------------------------------------------------------
drop policy if exists "Enable insert access for all users" on public.cold_lead_notes;
drop policy if exists "Enable update for users based on email" on public.cold_lead_notes;

-- ---------------------------------------------------------------------------
-- Indices de apoio
-- ---------------------------------------------------------------------------
-- Unico por tenant + telefone (aplicado depois de juntar os 1314 duplicados da Sigma;
-- os imports usam upsert onConflict tenant_id,telefone ignoreDuplicates).
create unique index if not exists uq_cold_leads_tenant_telefone on public.cold_leads (tenant_id, telefone);
create index if not exists idx_cold_leads_tenant_stage on public.cold_leads (tenant_id, stage_id);
