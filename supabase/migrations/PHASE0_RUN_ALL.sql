-- =====================================================================
-- PHASE 0 — RODAR TUDO DE UMA VEZ NO SQL EDITOR DO SUPABASE
-- =====================================================================
-- Cole esse arquivo INTEIRO no SQL Editor do Supabase Dashboard e
-- clique Run. Tres etapas executam em sequencia dentro de uma unica
-- transacao (BEGIN/COMMIT). Se qualquer passo falhar, NADA e aplicado.
--
-- Etapas:
--   1. Cleanup dos 4 tenants zumbis
--   2. Enriquecimento da tabela tenants
--   3. Tabela tenant_integrations + remocao das colunas evolution_*
-- =====================================================================

BEGIN;

-- =====================================================================
-- ETAPA 1 — CLEANUP DOS TENANTS ZUMBIS
-- =====================================================================

DO $$
DECLARE
    zombie_ids uuid[] := ARRAY[
        'aa1ccc09-405d-40e5-b61c-cddbcfc4a0a6'::uuid,
        'e71da085-2cc2-4a0e-8b40-8e067600d808'::uuid,
        '0b19ee20-0cd1-4bbd-9023-56639638e25f'::uuid,
        'dbbf3665-ff4d-479f-a652-323120bba9eb'::uuid
    ];
    zombie_user_ids uuid[];
BEGIN
    SELECT array_agg(id) INTO zombie_user_ids
    FROM public.profiles
    WHERE tenant_id = ANY(zombie_ids);

    DELETE FROM public.stages
    WHERE pipeline_id IN (
        SELECT id FROM public.pipelines WHERE tenant_id = ANY(zombie_ids)
    );

    DELETE FROM public.pipelines WHERE tenant_id = ANY(zombie_ids);
    DELETE FROM public.profiles  WHERE tenant_id = ANY(zombie_ids);
    DELETE FROM public.tenants   WHERE id        = ANY(zombie_ids);

    IF zombie_user_ids IS NOT NULL AND array_length(zombie_user_ids, 1) > 0 THEN
        DELETE FROM auth.users WHERE id = ANY(zombie_user_ids);
    END IF;

    RAISE NOTICE 'Etapa 1 OK: % tenants zumbis removidos, % usuarios.',
        array_length(zombie_ids, 1),
        COALESCE(array_length(zombie_user_ids, 1), 0);
END $$;

-- =====================================================================
-- ETAPA 2 — ENRIQUECIMENTO DA TABELA TENANTS
-- =====================================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS is_active     boolean      NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS slug          text,
    ADD COLUMN IF NOT EXISTS plan          text         NOT NULL DEFAULT 'custom',
    ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
    ADD COLUMN IF NOT EXISTS billing_email text,
    ADD COLUMN IF NOT EXISTS notes         text,
    ADD COLUMN IF NOT EXISTS created_by    uuid,
    ADD COLUMN IF NOT EXISTS updated_at    timestamptz  NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tenants_plan_check'
          AND conrelid = 'public.tenants'::regclass
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_plan_check
            CHECK (plan IN ('custom', 'starter', 'pro', 'enterprise'));
    END IF;
END $$;

UPDATE public.tenants
SET slug = LOWER(
    REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')
) || '-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL;

ALTER TABLE public.tenants ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tenants_slug_key'
          AND conrelid = 'public.tenants'::regclass
    ) THEN
        ALTER TABLE public.tenants
            ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tenants_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE PROCEDURE public.tenants_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants (is_active);
CREATE INDEX IF NOT EXISTS idx_tenants_plan      ON public.tenants (plan);

DO $$
BEGIN
    RAISE NOTICE 'Etapa 2 OK: tabela tenants enriquecida com slug, plan, is_active etc.';
END $$;

-- =====================================================================
-- ETAPA 3 — TENANT_INTEGRATIONS + REMOCAO DE EVOLUTION_* DA TENANTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.tenant_integrations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider    text NOT NULL,
    config      jsonb NOT NULL DEFAULT '{}'::jsonb,
    status      text NOT NULL DEFAULT 'inactive',
    last_sync_at timestamptz,
    error_message text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tenant_integrations_unique UNIQUE (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant
    ON public.tenant_integrations (tenant_id);

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

ALTER TABLE public.tenant_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_integrations_select" ON public.tenant_integrations;
CREATE POLICY "tenant_integrations_select" ON public.tenant_integrations
    FOR SELECT USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

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

ALTER TABLE public.tenants
    DROP COLUMN IF EXISTS evolution_instance_name,
    DROP COLUMN IF EXISTS evolution_instance_id,
    DROP COLUMN IF EXISTS evolution_status,
    DROP COLUMN IF EXISTS evolution_token;

DO $$
BEGIN
    RAISE NOTICE 'Etapa 3 OK: tenant_integrations criada, evolution_* arquivado e removido.';
END $$;

COMMIT;

-- =====================================================================
-- VALIDACAO RAPIDA APOS COMMIT
-- =====================================================================
-- Roda essas queries (uma de cada vez) APOS o BEGIN/COMMIT acima.
-- Elas estao comentadas para nao executarem automaticamente.
--
-- 1. Deve mostrar so 2 tenants (GRUPO NG + Sigma) com slug, plan, is_active
--    SELECT id, name, slug, plan, is_active FROM public.tenants;
--
-- 2. Deve listar as colunas novas da tabela tenants
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='tenants' AND table_schema='public'
--    ORDER BY ordinal_position;
--
-- 3. Deve mostrar 1 linha do GRUPO NG com provider='evolution_legacy'
--    SELECT tenant_id, provider, status, config FROM public.tenant_integrations;
--
-- 4. Deve retornar 0 linhas (colunas evolution_* foram removidas)
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='tenants' AND column_name LIKE 'evolution_%';
