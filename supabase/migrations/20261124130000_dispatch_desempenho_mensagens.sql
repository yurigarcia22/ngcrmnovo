-- Desempenho por mensagem no disparo: qual variacao foi enviada pra cada contato
-- e se o contato respondeu depois (mensagem inbound no mesmo numero).
alter table public.dispatch_recipients add column if not exists message_index integer;
alter table public.dispatch_recipients add column if not exists message_template text;

-- Um registro por contato enviado, com a primeira resposta dele depois do envio.
-- Chamado so pelo servidor (service role); o tenant vem da sessao no server action.
create or replace function public.dispatch_recipient_replies(p_tenant uuid, p_campaign_ids uuid[] default null)
returns table (recipient_id uuid, campaign_id uuid, message_index integer, message_template text,
               sent_at timestamptz, replied_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.campaign_id, r.message_index, r.message_template, r.sent_at,
         (select min(m.created_at)
            from messages m
            join contacts ct on ct.id = m.contact_id
           where m.tenant_id = r.tenant_id
             and m.direction = 'inbound'
             and m.created_at > r.sent_at
             and (m.instance_name is null or m.instance_name = c.instance_name)
             and regexp_replace(coalesce(ct.phone, ''), '\D', '', 'g') = any (public.br_phone_variants(r.phone))
         ) as replied_at
    from dispatch_recipients r
    join dispatch_campaigns c on c.id = r.campaign_id
   where r.tenant_id = p_tenant
     and c.tenant_id = p_tenant
     and r.status = 'sent'
     and (p_campaign_ids is null or r.campaign_id = any (p_campaign_ids));
$$;

revoke all on function public.dispatch_recipient_replies(uuid, uuid[]) from public, anon, authenticated;
