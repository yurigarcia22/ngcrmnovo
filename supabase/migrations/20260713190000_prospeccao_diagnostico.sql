-- Diagnostico aprofundado da Prospeccao: gera um raio-x comercial estruturado
-- por eixos, publicavel por link (token) pra mandar pro lead. Aditivo.

ALTER TABLE public.prospeccao_leads
  ADD COLUMN IF NOT EXISTS diagnostico       jsonb,
  ADD COLUMN IF NOT EXISTS diag_token        text,
  ADD COLUMN IF NOT EXISTS diag_generated_at timestamptz;

-- Token unico pra URL publica do diagnostico (/d/<token>)
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospeccao_diag_token
  ON public.prospeccao_leads(diag_token) WHERE diag_token IS NOT NULL;
