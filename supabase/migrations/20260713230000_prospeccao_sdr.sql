-- Fase B: SDR da Prospeccao (continuidade do atendimento).
-- Quando o lead responde no WhatsApp (instancia dedicada Izabella), o agente
-- responde usando o dossie. Aditivo, isolado do modulo webinar.

ALTER TABLE public.prospeccao_leads
  ADD COLUMN IF NOT EXISTS ultima_resposta timestamptz,
  ADD COLUMN IF NOT EXISTS sdr_ativo       boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.prospeccao_conversas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  lead_id     uuid REFERENCES public.prospeccao_leads(id) ON DELETE CASCADE,
  telefone    text NOT NULL,
  origem      text NOT NULL,          -- 'lead' | 'sdr'
  mensagem    text NOT NULL,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospeccao_conversas_tel ON public.prospeccao_conversas(tenant_id, telefone, created_at);

ALTER TABLE public.prospeccao_conversas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospeccao_conversas_tenant_isolation ON public.prospeccao_conversas;
CREATE POLICY prospeccao_conversas_tenant_isolation ON public.prospeccao_conversas
  FOR ALL USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));
