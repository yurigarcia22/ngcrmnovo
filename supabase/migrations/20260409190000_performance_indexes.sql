-- ========================================
-- PERFORMANCE INDEXES - CRM NG
-- Data: 2026-04-09
-- Objetivo: acelerar queries de listagem e filtros
--           nas tabelas de maior volume (cold_leads 2338,
--           cold_lead_notes 3245, deals 198)
-- ========================================

-- 1. Cold leads filtrados por tenant + status
--    Usado em: /cold-call listagem principal, dashboard metrics
CREATE INDEX IF NOT EXISTS idx_cold_leads_tenant_status
    ON public.cold_leads(tenant_id, status);

-- 2. Cold leads por responsavel (filtro "meus leads")
--    Partial index: so indexa leads com responsavel atribuido
CREATE INDEX IF NOT EXISTS idx_cold_leads_responsavel
    ON public.cold_leads(responsavel_id)
    WHERE responsavel_id IS NOT NULL;

-- 3. Deals por tenant + stage (kanban principal)
--    Usado em: /leads kanban, realtime subscriptions
CREATE INDEX IF NOT EXISTS idx_deals_tenant_stage
    ON public.deals(tenant_id, stage_id, status);

-- 4. Deals por owner em aberto (filtro por vendedor no dashboard)
--    Partial index: apenas deals com status 'open'
CREATE INDEX IF NOT EXISTS idx_deals_owner_status
    ON public.deals(owner_id, status)
    WHERE status = 'open';

-- 5. Cold lead notes por lead (carregamento do modal de cold call)
--    Inclui ordering DESC para evitar sort extra
CREATE INDEX IF NOT EXISTS idx_cold_lead_notes_lead
    ON public.cold_lead_notes(cold_lead_id, created_at DESC);

-- 6. Follow-ups por data + status (cron de notificacoes + painel)
--    Partial: so indexa followups ativos (pendente/atrasado)
CREATE INDEX IF NOT EXISTS idx_cold_call_followups_data_status
    ON public.cold_call_followups(data_agendada, status)
    WHERE status IN ('pendente', 'atrasado');

-- 7. Email messages por conta + data (inbox ordenado)
--    Partial: exclui soft-deleted
CREATE INDEX IF NOT EXISTS idx_email_messages_account_created
    ON public.email_messages(account_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- ========================================
-- Notas:
-- - Todos os indices usam IF NOT EXISTS para ser idempotentes
-- - Partial indexes reduzem tamanho e aceleram queries especificas
-- - Para aplicar em producao sem lock, usar CREATE INDEX CONCURRENTLY
--   (mas ai nao pode estar em transaction)
-- ========================================
