-- ============================================================
-- WEBINAR MODULE — Multi-instance rotation + Conversation history
-- ============================================================
-- Adiciona:
-- 1. webinar_campaigns.instance_names (array, rotacao aleatoria anti-ban)
-- 2. webinar_messages.direction (inbound | outbound)
-- 3. webinar_messages.ai_generated (se foi gerado pelo agente Gemini)
-- 4. webinar_messages.ai_metadata (jsonb com intent, tools_used, etc)
-- ============================================================

-- 1. Multi-instance no campaign (rotacao anti-ban)
ALTER TABLE public.webinar_campaigns
    ADD COLUMN IF NOT EXISTS instance_names text[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.webinar_campaigns.instance_names IS
    'Array de instance_name do Evolution. Rotacionadas aleatoriamente em cada disparo. Reduz risco de ban distribuindo carga entre numeros.';

-- 2. Direction + AI nas mensagens (suporte a conversacao bidireicional)
ALTER TABLE public.webinar_messages
    ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound'
        CHECK (direction IN ('outbound', 'inbound'));

ALTER TABLE public.webinar_messages
    ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;

ALTER TABLE public.webinar_messages
    ADD COLUMN IF NOT EXISTS ai_metadata jsonb;

ALTER TABLE public.webinar_messages
    ADD COLUMN IF NOT EXISTS instance_used text;

CREATE INDEX IF NOT EXISTS idx_wm_direction ON public.webinar_messages (direction);
CREATE INDEX IF NOT EXISTS idx_wm_lead_created ON public.webinar_messages (campaign_lead_id, created_at DESC);

COMMENT ON COLUMN public.webinar_messages.direction IS 'outbound = enviada pra lead (cadencia ou resposta agente). inbound = recebida do lead.';
COMMENT ON COLUMN public.webinar_messages.ai_generated IS 'true se foi gerada pelo agente Gemini (vs template fixo).';
COMMENT ON COLUMN public.webinar_messages.ai_metadata IS 'Dados estruturados da decisao IA: intent, tools_called, confidence, reasoning.';
COMMENT ON COLUMN public.webinar_messages.instance_used IS 'Qual instance do Evolution foi usada pra disparar (rastreio anti-ban).';

-- 3. Adicionar status novo "interessado_futuro" no funil
ALTER TABLE public.webinar_campaign_leads
    DROP CONSTRAINT IF EXISTS webinar_campaign_leads_funnel_status_check;

ALTER TABLE public.webinar_campaign_leads
    ADD CONSTRAINT webinar_campaign_leads_funnel_status_check
    CHECK (funnel_status IN (
        'scraped', 'enriched', 'invited', 'viewed', 'replied',
        'confirmed', 'attended', 'no_show', 'converted',
        'interested_future', 'escalated', 'lost'
    ));

COMMENT ON COLUMN public.webinar_campaign_leads.funnel_status IS
    'Status do lead no funil. interested_future = mostrou interesse mas nao pode neste evento. escalated = travado, precisa humano.';

-- 4. Adicionar campo last_interaction pra ordenacao no kanban
ALTER TABLE public.webinar_campaign_leads
    ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_wcl_last_interaction ON public.webinar_campaign_leads (last_interaction_at DESC NULLS LAST);

-- 5. Trigger pra atualizar last_interaction_at quando webinar_messages eh inserida
CREATE OR REPLACE FUNCTION update_lead_last_interaction()
RETURNS trigger AS $$
BEGIN
    UPDATE public.webinar_campaign_leads
    SET last_interaction_at = NEW.created_at
    WHERE id = NEW.campaign_lead_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_lead_last_interaction ON public.webinar_messages;
CREATE TRIGGER trg_update_lead_last_interaction
    AFTER INSERT ON public.webinar_messages
    FOR EACH ROW EXECUTE FUNCTION update_lead_last_interaction();
