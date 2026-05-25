-- ============================================================
-- PHASE 0 / STEP 2 — ENRIQUECIMENTO DA TABELA TENANTS
-- ============================================================
-- Adiciona colunas necessarias para virar SaaS:
--   is_active        controla bloqueio de tenant
--   slug             identificador human-friendly (futuras URLs)
--   plan             pacote comercial (custom / starter / pro / enterprise)
--   trial_ends_at    fim do trial (null = sem trial)
--   billing_email    contato financeiro (pode ser != admin do tenant)
--   notes            campo livre interno (so super-admin ve)
--   created_by       quem criou (super-admin que cadastrou)
--   updated_at       timestamp do ultimo update
-- ============================================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS is_active     boolean      NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS slug          text,
    ADD COLUMN IF NOT EXISTS plan          text         NOT NULL DEFAULT 'custom',
    ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
    ADD COLUMN IF NOT EXISTS billing_email text,
    ADD COLUMN IF NOT EXISTS notes         text,
    ADD COLUMN IF NOT EXISTS created_by    uuid,
    ADD COLUMN IF NOT EXISTS updated_at    timestamptz  NOT NULL DEFAULT now();

-- Plan check constraint (extensivel: basta adicionar opcao depois)
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

-- Backfill de slug para os tenants ja existentes.
-- Estrategia: lowercase + replace de espacos por hifen + sufixo curto do uuid.
UPDATE public.tenants
SET slug = LOWER(
    REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g')
) || '-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL;

-- Garantir unique e not null em slug depois do backfill
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

-- Trigger para manter updated_at automatico
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

-- Index para filtrar tenants ativos rapidamente no /admin
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants (is_active);
CREATE INDEX IF NOT EXISTS idx_tenants_plan      ON public.tenants (plan);
