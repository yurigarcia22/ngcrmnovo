-- Vínculo entre lead de webinar e deal do CRM principal.
-- Quando o user "envia pro CRM" um lead confirmado da aba Confirmados,
-- a gente cria um deal e guarda o id aqui pra impedir duplicação e
-- pra mostrar link "abrir no CRM" depois.

ALTER TABLE public.webinar_campaign_leads
  ADD COLUMN IF NOT EXISTS crm_deal_id UUID NULL,
  ADD COLUMN IF NOT EXISTS crm_pushed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS crm_pushed_mode TEXT NULL
    CHECK (crm_pushed_mode IS NULL OR crm_pushed_mode IN ('lead', 'meeting', 'sale'));

CREATE INDEX IF NOT EXISTS idx_wcl_crm_deal ON public.webinar_campaign_leads (crm_deal_id);
