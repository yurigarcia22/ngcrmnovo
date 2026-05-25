-- ============================================================
-- PHASE 0 / STEP 3 — TABELA TENANT_INTEGRATIONS + LIMPEZA TENANTS
-- ============================================================
-- Cria uma tabela generica para guardar config de integracoes
-- externas por tenant (Evolution, n8n, etc) sem poluir a tabela
-- tenants. Em seguida arquiva os dados antigos de evolution_*
-- que estavam diretamente em tenants e dropa essas colunas.
-- ============================================================

-- 1. Tabela tenant_integrations
CREATE TABLE IF NOT EXISTS public.tenant_integrations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider    text NOT NULL,
    -- ex: 'evolution', 'evolution_legacy', 'n8n', 'openai', 'sendgrid'
    config      jsonb NOT NULL DEFAULT '{}'::jsonb,
    status      text NOT NULL DEFAULT 'inactive',
    -- ex: 'active', 'inactive', 'error', 'connecting'
    last_sync_at timestamptz,
    error_message text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tenant_integrations_unique UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant
    ON public.tenant_integrations (tenant_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tenant_integrations_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_integrations_updated_at ON public.tenant_integrations;
CREATE TRIGGER trg_tenant_integrations_updated_at
    BEFORE UPDATE ON public.tenant_integrations
    FOR EACH ROW EXECUTE PROCEDURE public.tenant_integrations_set_updated_at();

-- 2. RLS
ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_integrations_select" ON public.tenant_integrations;
CREATE POLICY "tenant_integrations_select" ON public.tenant_integrations
    FOR SELECT USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

-- INSERT/UPDATE/DELETE permitidos so via service role (sem policy).
-- Configuracao de integracao e operacao sensivel, fica restrita ao
-- /admin e a actions especificas.

-- 3. Arquivar dados antigos de evolution_* da tabela tenants
INSERT INTO public.tenant_integrations (tenant_id, provider, config, status)
SELECT
    id AS tenant_id,
    'evolution_legacy' AS provider,
    jsonb_build_object(
        'instance_name', evolution_instance_name,
        'instance_id',   evolution_instance_id,
        'token',         evolution_token,
        'archived_at',   now()::text
    ) AS config,
    COALESCE(evolution_status, 'inactive') AS status
FROM public.tenants
WHERE evolution_instance_name IS NOT NULL
   OR evolution_instance_id   IS NOT NULL
   OR evolution_token         IS NOT NULL
ON CONFLICT (tenant_id, provider) DO NOTHING;

-- 4. Dropar as colunas evolution_* da tabela tenants
ALTER TABLE public.tenants
    DROP COLUMN IF EXISTS evolution_instance_name,
    DROP COLUMN IF EXISTS evolution_instance_id,
    DROP COLUMN IF EXISTS evolution_status,
    DROP COLUMN IF EXISTS evolution_token;
