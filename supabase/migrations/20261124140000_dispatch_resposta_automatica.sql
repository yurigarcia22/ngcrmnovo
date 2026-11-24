-- Disparo: separa resposta automatica (boas-vindas, menu, ausencia) de resposta de gente.
-- Contabilidade costuma ter robo no WhatsApp que responde em segundos; antes isso
-- contava como "respondeu" no painel de desempenho das mensagens.

-- Mensagem automatica = chegou em menos de 60 s depois do disparo OU tem cara de robo.
create or replace function public.dispatch_is_auto_reply(p_content text, p_secs_after numeric)
returns boolean language sql immutable as $$
  select coalesce(p_secs_after, 0) < 60
      or lower(translate(coalesce(p_content, ''),
           'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
           'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')) ~ any (array[
        'bem[ -]?vind',                         -- bem-vindo(a)
        'selecione (uma )?(das )?opc',          -- menu
        'escolha (uma )?(das )?opc',
        'digite (o )?(numero|a opcao|1)',
        '\(1\)|1️?⃣|(^|\n)\s*1\s*[-.)]',   -- (1) / 1️⃣ / "1 -" no comeco da linha
        'horario de atendimento',
        'em breve (voce )?sera atendid',
        'em breve (retornaremos|entraremos|responderemos)',
        'retornaremos (o mais breve|assim que|em breve)',
        'mensagem automatica',
        'resposta automatica',
        'assistente virtual|atendente virtual|atendimento virtual',
        'fora do (nosso )?horario',
        'protocolo( de atendimento)?:? ?\d'
        -- de proposito FORA: "agradecemos o contato", "no momento nao podemos":
        -- gente recusando escreve assim, e recusa tambem e resposta.
      ]);
$$;

drop function if exists public.dispatch_recipient_replies(uuid, uuid[]);

-- replied_at  = primeira resposta de GENTE depois do disparo (o que conta no painel)
-- auto_at     = primeira resposta automatica (so informativo)
create function public.dispatch_recipient_replies(p_tenant uuid, p_campaign_ids uuid[] default null)
returns table (recipient_id uuid, campaign_id uuid, message_index integer, message_template text,
               sent_at timestamptz, replied_at timestamptz, auto_at timestamptz)
language sql stable security definer set search_path = public as $$
  with base as (
    select r.id, r.campaign_id, r.message_index, r.message_template, r.sent_at, r.phone, r.tenant_id, c.instance_name
      from dispatch_recipients r
      join dispatch_campaigns c on c.id = r.campaign_id
     where r.tenant_id = p_tenant
       and c.tenant_id = p_tenant
       and r.status = 'sent'
       and (p_campaign_ids is null or r.campaign_id = any (p_campaign_ids))
  ),
  inb as (
    select b.id as rid, m.created_at,
           public.dispatch_is_auto_reply(m.content, extract(epoch from (m.created_at - b.sent_at))) as is_auto
      from base b
      join contacts ct on ct.tenant_id = b.tenant_id
                      and regexp_replace(coalesce(ct.phone, ''), '\D', '', 'g') = any (public.br_phone_variants(b.phone))
      join messages m on m.contact_id = ct.id
                     and m.tenant_id = b.tenant_id
                     and m.direction = 'inbound'
                     and m.created_at > b.sent_at
                     and (m.instance_name is null or m.instance_name = b.instance_name)
  )
  select b.id, b.campaign_id, b.message_index, b.message_template, b.sent_at,
         (select min(i.created_at) from inb i where i.rid = b.id and not i.is_auto),
         (select min(i.created_at) from inb i where i.rid = b.id and i.is_auto)
    from base b;
$$;

revoke all on function public.dispatch_recipient_replies(uuid, uuid[]) from public, anon, authenticated;
