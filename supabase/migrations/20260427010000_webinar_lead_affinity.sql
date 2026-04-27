-- ============================================================
-- WEBINAR — Lead affinity pra continuidade de conversa em failover
-- ============================================================
-- Adiciona last_instance_used no lead pra:
--   1. pickInstance() priorizar a mesma instance que usou pra esse lead
--   2. Detectar failover (quando precisa mudar de número)
-- ============================================================

ALTER TABLE public.webinar_campaign_leads
    ADD COLUMN IF NOT EXISTS last_instance_used text;

COMMENT ON COLUMN public.webinar_campaign_leads.last_instance_used IS
    'Última instance Evolution usada pra mandar mensagem pra este lead. Usado pra lead affinity (manter mesmo número quando possível) e pra detectar failover.';

CREATE INDEX IF NOT EXISTS idx_wcl_last_instance ON public.webinar_campaign_leads (last_instance_used);
