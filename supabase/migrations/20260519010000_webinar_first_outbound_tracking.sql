-- ============================================================
-- WEBINAR — Tracking de primeiro contato por lead
-- ============================================================
-- Registra quando e qual chip disparou a primeira mensagem
-- pra cada lead. Permite filtrar/analisar por horario e instancia
-- na UI sem precisar fazer N+1 queries.
-- ============================================================

ALTER TABLE public.webinar_campaign_leads
    ADD COLUMN IF NOT EXISTS first_outbound_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_outbound_instance TEXT;

COMMENT ON COLUMN public.webinar_campaign_leads.first_outbound_at IS
    'Timestamp da primeira mensagem outbound enviada pra esse lead. NULL = nunca disparou.';

COMMENT ON COLUMN public.webinar_campaign_leads.first_outbound_instance IS
    'Qual instancia (chip) fez o primeiro disparo. Pra analise por chip.';

CREATE INDEX IF NOT EXISTS idx_webinar_leads_first_outbound_at
    ON public.webinar_campaign_leads (first_outbound_at)
    WHERE first_outbound_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_webinar_leads_first_outbound_instance
    ON public.webinar_campaign_leads (first_outbound_instance)
    WHERE first_outbound_instance IS NOT NULL;

-- Trigger pra preencher automaticamente quando 1a outbound for inserida
CREATE OR REPLACE FUNCTION public.webinar_set_first_outbound()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.direction = 'outbound'
       AND NEW.status IN ('sent','delivered','read')
       AND NEW.instance_used IS NOT NULL THEN
        UPDATE public.webinar_campaign_leads
        SET first_outbound_at = COALESCE(NEW.sent_at, NOW()),
            first_outbound_instance = NEW.instance_used
        WHERE id = NEW.campaign_lead_id
          AND first_outbound_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS webinar_first_outbound_trigger ON public.webinar_messages;
CREATE TRIGGER webinar_first_outbound_trigger
AFTER INSERT ON public.webinar_messages
FOR EACH ROW
EXECUTE FUNCTION public.webinar_set_first_outbound();

-- Backfill: preenche valores historicos
UPDATE public.webinar_campaign_leads l
SET first_outbound_at = sub.first_at,
    first_outbound_instance = sub.first_instance
FROM (
    SELECT DISTINCT ON (campaign_lead_id)
        campaign_lead_id,
        sent_at AS first_at,
        instance_used AS first_instance
    FROM public.webinar_messages
    WHERE direction = 'outbound'
      AND status IN ('sent','delivered','read')
      AND instance_used IS NOT NULL
      AND sent_at IS NOT NULL
    ORDER BY campaign_lead_id, sent_at ASC
) sub
WHERE sub.campaign_lead_id = l.id
  AND l.first_outbound_at IS NULL;
