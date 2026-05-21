-- ============================================================
-- WEBINAR — Validação automática de WhatsApp nos leads
-- ============================================================
-- Adiciona colunas pra rastrear status da validação WhatsApp.
-- Validador chama Evolution /chat/whatsappNumbers em batch ao
-- importar/scrapear leads novos. Sem WhatsApp = lost('no_whatsapp').
-- ============================================================

ALTER TABLE public.webinar_campaign_leads
    ADD COLUMN IF NOT EXISTS whatsapp_validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_valid BOOLEAN,
    ADD COLUMN IF NOT EXISTS whatsapp_jid TEXT,
    ADD COLUMN IF NOT EXISTS extra_phones JSONB,
    ADD COLUMN IF NOT EXISTS site_enriched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.webinar_campaign_leads.whatsapp_validated_at IS
    'Quando o número foi checado no Evolution (/chat/whatsappNumbers).';
COMMENT ON COLUMN public.webinar_campaign_leads.whatsapp_valid IS
    'TRUE se o número tem WhatsApp ativo. FALSE = sem WhatsApp (vira lost).';
COMMENT ON COLUMN public.webinar_campaign_leads.whatsapp_jid IS
    'JID retornado pelo Evolution (pode diferir do phone — Evolution corrige o 9 do celular).';
COMMENT ON COLUMN public.webinar_campaign_leads.extra_phones IS
    'Telefones adicionais extraídos do site da clínica (wa.me, tel:, etc). Array de strings.';
COMMENT ON COLUMN public.webinar_campaign_leads.site_enriched_at IS
    'Quando o site foi scrapeado pra extrair contatos extras.';

CREATE INDEX IF NOT EXISTS idx_webinar_leads_whatsapp_validated
    ON public.webinar_campaign_leads (whatsapp_validated_at)
    WHERE whatsapp_validated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_webinar_leads_whatsapp_valid
    ON public.webinar_campaign_leads (whatsapp_valid)
    WHERE whatsapp_valid = TRUE;
