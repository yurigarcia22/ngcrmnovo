-- Entrada do WhatsApp por funil (24/11/2026).
-- Funil com whatsapp_inbox = false (ex.: leads de Meta Ads de um cliente) nao recebe
-- conversa nova do WhatsApp e a coluna de entrada mostra o cartao normal do Kanban,
-- nao o cartao de conversa. Padrao = true (comportamento de antes).
alter table public.pipelines add column if not exists whatsapp_inbox boolean not null default true;

-- Funil Flavio | PenseFar (tenant GRUPO NG): leads vem do Meta Ads, sem WhatsApp.
update public.pipelines set whatsapp_inbox = false
 where id = 38 and tenant_id = '00000000-0000-0000-0000-000000000000';

-- Etapa de entrada para uma conversa nova do WhatsApp (usado so pelo webhook-evolution).
-- Ordem de preferencia, sempre entre funis de vendas com a entrada do WhatsApp ligada:
--   1. o funil vinculado ao numero (instancia), se tiver a entrada ligada
--   2. o funil padrao
--   3. qualquer outro funil com a entrada ligada (o mais antigo)
-- Se nenhum funil tiver a entrada ligada, cai no padrao (nao perde a conversa).
create or replace function public.get_inbox_stage_for_instance(p_tenant_id uuid, p_pipeline_id bigint)
returns bigint language sql stable as $$
  select s.id
    from public.stages s
    join public.pipelines p on p.id = s.pipeline_id
   where p.tenant_id = p_tenant_id
     and p.kind = 'deals'
   order by (p_pipeline_id is not null and p.id = p_pipeline_id and p.whatsapp_inbox) desc,
            (p.is_default and p.whatsapp_inbox) desc,
            p.whatsapp_inbox desc,
            p.is_default desc,
            p.created_at, p.id,
            (s.is_inbox = true) desc nulls last, s.position asc
   limit 1;
$$;
