-- =============================================================
-- MODULO IA INTELIGENCIA — Fase 1 (fundacao)
-- Plano: docs/IA-INTELIGENCIA.md
-- A IA NUNCA envia mensagem: nao existe caminho de envio no motor.
-- =============================================================

-- 1) ORIGEM DO LEAD (atribuicao automatica: Meta Ads CTWA etc.)
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS origin_detail jsonb;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS ctwa_clid text;
COMMENT ON COLUMN public.deals.origin IS 'meta_ads | google | site | organico | indicacao | desconhecido (deteccao automatica)';
COMMENT ON COLUMN public.deals.origin_detail IS 'ex.: externalAdReply do CTWA (titulo/anuncio/sourceUrl) sem thumbnail';

-- 2) CONFIG POR TENANT
CREATE TABLE IF NOT EXISTS public.ai_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'observer' CHECK (mode IN ('observer','pilot')),
  vertical text NOT NULL DEFAULT 'generic' CHECK (vertical IN ('veterinary','dentistry','generic')),
  services jsonb,
  analyze_from timestamptz,          -- nao analisar conversas anteriores a esta data
  model text NOT NULL DEFAULT 'gpt-5-mini',
  min_confidence_move numeric NOT NULL DEFAULT 0.85,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) ESTADO IA CORRENTE POR DEAL (1:1, atualizavel)
CREATE TABLE IF NOT EXISTS public.deal_ai_state (
  deal_id uuid PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  funnel_stage text,
  intent_score int,
  service_interest text[],
  waiting_on text,
  waiting_since timestamptz,
  appointment jsonb,
  price jsonb,
  extracted jsonb,
  summary text,
  next_action text,
  lost_suggestion jsonb,            -- IA sugere perda; NUNCA executa
  origin_guess text,                -- palpite de origem quando nao ha CTWA
  confidence numeric,
  last_analyzed_message_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_ai_state_tenant ON public.deal_ai_state (tenant_id);
CREATE INDEX IF NOT EXISTS idx_deal_ai_state_stage ON public.deal_ai_state (tenant_id, funnel_stage);

-- 4) HISTORICO IMUTAVEL DE ANALISES (auditoria/versionamento de prompt)
CREATE TABLE IF NOT EXISTS public.ai_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  prompt_version text NOT NULL,
  model text NOT NULL,
  messages_from timestamptz,
  messages_to timestamptz,
  structured_output jsonb NOT NULL,
  summary text,
  confidence numeric,
  input_tokens int,
  output_tokens int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_deal ON public.ai_analysis (deal_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_tenant ON public.ai_analysis (tenant_id, created_at desc);

-- 5) TIMELINE DE EVENTOS (auditavel; com evidencias)
CREATE TABLE IF NOT EXISTS public.crm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_value text,
  new_value text,
  source text NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','human','system')),
  confidence numeric,
  evidence_message_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_events_deal ON public.crm_events (deal_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_crm_events_tenant ON public.crm_events (tenant_id, event_type, created_at desc);

-- 6) MAPEAMENTO ESTADO IA -> ETAPA REAL (modo piloto, Fase 3)
CREATE TABLE IF NOT EXISTS public.ai_stage_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id bigint NOT NULL,
  ai_stage text NOT NULL,
  stage_id bigint NOT NULL,
  UNIQUE (pipeline_id, ai_stage)
);

-- RLS (padrao do projeto: isolamento por get_my_tenant_id)
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_ai_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_stage_mapping ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Multitenant Isolation" ON public.ai_settings USING (tenant_id = get_my_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Multitenant Isolation" ON public.deal_ai_state USING (tenant_id = get_my_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Multitenant Isolation" ON public.ai_analysis USING (tenant_id = get_my_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Multitenant Isolation" ON public.crm_events USING (tenant_id = get_my_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Multitenant Isolation" ON public.ai_stage_mapping USING (tenant_id = get_my_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SEED: Dra. Yasmin (piloto n.1) — modo OBSERVADOR, vertical odontologia
INSERT INTO public.ai_settings (tenant_id, enabled, mode, vertical, services, analyze_from, model)
VALUES (
  '51b44d8a-4596-42bd-8f59-6a6a356fe8a7', true, 'observer', 'dentistry',
  '["consulta_avaliacao","urgencia_dor","limpeza","clareamento","facetas","implante","ortodontia","canal","extracao","protese","restauracao","cirurgia","retorno","exame","financeiro","outro"]'::jsonb,
  '2026-08-01', 'gpt-5-mini'
)
ON CONFLICT (tenant_id) DO NOTHING;

-- Selecao de conversas prontas para analise (debounce de 90s, lote limitado)
CREATE OR REPLACE FUNCTION public.ai_pick_deals(p_limit int DEFAULT 12)
RETURNS TABLE(deal_id uuid, tenant_id uuid, last_msg_at timestamptz)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT d.id, d.tenant_id, mx.last_msg
  FROM deals d
  JOIN ai_settings s ON s.tenant_id = d.tenant_id AND s.enabled
  JOIN LATERAL (
    SELECT max(m.created_at) AS last_msg FROM messages m WHERE m.deal_id = d.id
  ) mx ON true
  LEFT JOIN deal_ai_state st ON st.deal_id = d.id
  WHERE d.status = 'open'
    AND mx.last_msg IS NOT NULL
    AND mx.last_msg > COALESCE(st.last_analyzed_message_at, '-infinity'::timestamptz)
    AND (s.analyze_from IS NULL OR mx.last_msg >= s.analyze_from)
    AND mx.last_msg < now() - interval '90 seconds'
  ORDER BY mx.last_msg ASC
  LIMIT p_limit
$$;
