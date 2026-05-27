-- ============================================================
-- PERFORMANCE OPTIMIZATIONS — 2026-05-27
-- ============================================================
-- Aplicado via Management API (este arquivo eh para historico).
--
-- Problema diagnosticado:
--   * profiles: 11.5M seq_scans (8 linhas) — todas as RLS policies
--     do schema public faziam (SELECT tenant_id FROM profiles WHERE id = auth.uid())
--     subqueries em cadeia, escalando linearmente com o numero de queries.
--   * tasks/deals/contacts/stages: 200k-700k seq_scans cada pelo mesmo motivo.
--   * Cron check-leads-every-minute (steal_neglected_leads) consumiu
--     2192s CPU acumulado e tinha bug multi-tenant (pegava 1º stage global
--     ignorando tenant, e qualquer perfil online — podia transferir lead
--     entre tenants).
--   * Faltavam indices em mensagens (deal_id, created_at) — getConversations
--     no /chat fazia full scan.
-- ============================================================

-- 1. Funcao STABLE SECURITY DEFINER que retorna tenant_id do usuario
-- O planner cacheia o retorno por query inteira, eliminando subquery
-- repetida na RLS.
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.current_tenant_id IS
'Retorna tenant_id do usuario logado. STABLE permite cache do planner. SECURITY DEFINER evita recursao na RLS de profiles.';

-- 2. Refatora 32 policies para usar (SELECT public.current_tenant_id())
-- (Ja aplicado via Management API — listado aqui para referencia)
--
-- Tabelas afetadas: cold_call_followups, cold_lead_notes, cold_leads,
-- contacts, custom_field_definitions, deal_members, deal_tags, loss_reasons,
-- notes, pipelines, quick_replies, stages, tags, tasks, team_invites,
-- tenant_integrations, tenant_modules, tenants, webinar_campaigns,
-- webinar_instance_stats_snapshot, whatsapp_instances.

-- 3. Indices novos
CREATE INDEX IF NOT EXISTS idx_messages_deal_created
    ON public.messages (deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_tenant
    ON public.contacts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_stages_pipeline_position
    ON public.stages (pipeline_id, position);

CREATE INDEX IF NOT EXISTS idx_stages_tenant
    ON public.stages (tenant_id);

CREATE INDEX IF NOT EXISTS idx_deals_tenant_owner
    ON public.deals (tenant_id, owner_id);

CREATE INDEX IF NOT EXISTS idx_deal_tags_deal
    ON public.deal_tags (deal_id);

CREATE INDEX IF NOT EXISTS idx_deal_members_deal
    ON public.deal_members (deal_id);

CREATE INDEX IF NOT EXISTS idx_tasks_deal
    ON public.tasks (deal_id)
    WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant
    ON public.profiles (tenant_id);

-- 4. Desabilita cron bugado steal_neglected_leads
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'check-leads-every-minute';
-- (Ja aplicado — funcao mantida no banco para reescrita futura tenant-aware)
