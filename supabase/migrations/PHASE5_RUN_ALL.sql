-- =====================================================================
-- PHASE 5 — FUNDAÇÃO DO LEAD INBOX (cola tudo no SQL Editor)
-- =====================================================================
-- O que faz:
--   1. Adiciona stages.is_inbox + pipelines.is_default + deals.promoted_at
--   2. Constraints: 1 inbox por pipeline, 1 default por tenant
--   3. Backfill dos dados existentes (stage com menor position = inbox)
--   4. Atualiza handle_new_user para criar pipeline default
--      automaticamente quando tenant novo nasce
--   5. Funcao helper get_tenant_inbox_stage(tenant_id)
--
-- IMPORTANTE: este script corrige bugs e prepara terreno para a
-- feature de Lead Entrada (estilo Kommo). Sem mudancas visuais ainda.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. NOVAS COLUNAS
-- =====================================================================
ALTER TABLE public.stages
    ADD COLUMN IF NOT EXISTS is_inbox boolean NOT NULL DEFAULT false;

ALTER TABLE public.pipelines
    ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

-- =====================================================================
-- 2. CONSTRAINTS — MAX 1 INBOX POR PIPELINE, MAX 1 DEFAULT POR TENANT
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS stages_one_inbox_per_pipeline
    ON public.stages (pipeline_id) WHERE is_inbox = true;

CREATE UNIQUE INDEX IF NOT EXISTS pipelines_one_default_per_tenant
    ON public.pipelines (tenant_id) WHERE is_default = true;

-- =====================================================================
-- 3. BACKFILL — STAGES
-- =====================================================================
-- Para cada pipeline, marca a stage com menor position como inbox.
WITH ranked AS (
    SELECT
        id,
        pipeline_id,
        ROW_NUMBER() OVER (PARTITION BY pipeline_id ORDER BY position ASC, id ASC) AS rn
    FROM public.stages
)
UPDATE public.stages s
SET is_inbox = true
FROM ranked r
WHERE s.id = r.id
  AND r.rn = 1
  AND NOT EXISTS (
      SELECT 1 FROM public.stages s2
      WHERE s2.pipeline_id = s.pipeline_id AND s2.is_inbox = true
  );

-- =====================================================================
-- 4. BACKFILL — PIPELINES
-- =====================================================================
-- Para cada tenant, marca o pipeline mais antigo como default.
WITH ranked AS (
    SELECT
        id,
        tenant_id,
        ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS rn
    FROM public.pipelines
)
UPDATE public.pipelines p
SET is_default = true
FROM ranked r
WHERE p.id = r.id
  AND r.rn = 1
  AND NOT EXISTS (
      SELECT 1 FROM public.pipelines p2
      WHERE p2.tenant_id = p.tenant_id AND p2.is_default = true
  );

-- =====================================================================
-- 5. FUNCAO HELPER — GET_TENANT_INBOX_STAGE
-- =====================================================================
-- Retorna a stage de entrada do pipeline default do tenant.
-- Usado pelo webhook-evolution (Edge Function).
CREATE OR REPLACE FUNCTION public.get_tenant_inbox_stage(p_tenant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
    SELECT s.id
    FROM public.stages s
    INNER JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE p.tenant_id = p_tenant_id
      AND p.is_default = true
      AND s.is_inbox = true
    LIMIT 1;
$$;

-- =====================================================================
-- 6. ATUALIZAR handle_new_user
-- =====================================================================
-- Agora cria pipeline default + stage inbox + 3 stages padrao
-- automaticamente quando tenant novo nasce (alem dos modulos).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_tenant_id uuid;
  new_pipeline_id integer;
  invited_tenant_id uuid;
  meta_role text;
BEGIN
  invited_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;
  meta_role := new.raw_user_meta_data->>'role';

  IF invited_tenant_id IS NOT NULL THEN
    -- CONVITE: tenant ja existe, so cria profile
    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (
      new.id,
      invited_tenant_id,
      COALESCE(meta_role, 'vendedor'),
      new.raw_user_meta_data->>'full_name'
    );

  ELSE
    -- SIGNUP NOVO: cria tenant + pipeline default + stages + modulos
    INSERT INTO public.tenants (name)
    VALUES (COALESCE(new.raw_user_meta_data->>'company_name', 'Minha Empresa'))
    RETURNING id INTO new_tenant_id;

    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (
      new.id,
      new_tenant_id,
      'admin',
      new.raw_user_meta_data->>'full_name'
    );

    -- Modulos default (mesma logica da Fase 2)
    INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
    VALUES
      (new_tenant_id, 'dashboard',         true),
      (new_tenant_id, 'leads',             true),
      (new_tenant_id, 'chat',              true),
      (new_tenant_id, 'whatsapp_connect',  true),
      (new_tenant_id, 'cold_call',         false),
      (new_tenant_id, 'webinar',           false),
      (new_tenant_id, 'emails',            false);

    -- Pipeline default + 4 stages (Entrada + 3 fases classicas)
    INSERT INTO public.pipelines (tenant_id, name, is_default)
    VALUES (new_tenant_id, 'Funil de Vendas', true)
    RETURNING id INTO new_pipeline_id;

    INSERT INTO public.stages (pipeline_id, name, position, is_inbox)
    VALUES
      (new_pipeline_id, 'Lead Entrada',     0, true),
      (new_pipeline_id, 'Qualificacao',     1, false),
      (new_pipeline_id, 'Negociacao',       2, false),
      (new_pipeline_id, 'Fechamento',       3, false);
  END IF;

  RETURN new;
END;
$$;

COMMIT;

-- =====================================================================
-- VALIDACAO POS-RUN (rode separadamente):
-- =====================================================================
-- a) Cada pipeline deve ter EXATAMENTE 1 stage com is_inbox=true
--    SELECT pipeline_id, COUNT(*) FROM stages WHERE is_inbox=true
--    GROUP BY pipeline_id;
--    (todos devem ser 1)
--
-- b) Cada tenant deve ter EXATAMENTE 1 pipeline com is_default=true
--    SELECT tenant_id, COUNT(*) FROM pipelines WHERE is_default=true
--    GROUP BY tenant_id;
--    (todos devem ser 1)
--
-- c) Inbox stage por tenant (deve resolver tudo):
--    SELECT t.name, get_tenant_inbox_stage(t.id) AS inbox_stage_id
--    FROM tenants t;
