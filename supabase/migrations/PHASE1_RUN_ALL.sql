-- =====================================================================
-- PHASE 1 — TABELAS DE SUPER-ADMIN (rodar no SQL Editor)
-- =====================================================================
-- Cole esse arquivo INTEIRO no SQL Editor do Supabase Dashboard e
-- clique Run.
-- =====================================================================

BEGIN;

-- =====================================================================
-- platform_admins
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL UNIQUE,
    password_hash   text NOT NULL,
    full_name       text,
    is_active       boolean NOT NULL DEFAULT true,
    last_login_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_admins_email_active
    ON public.platform_admins (lower(email)) WHERE is_active = true;

CREATE OR REPLACE FUNCTION public.platform_admins_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_admins_updated_at ON public.platform_admins;
CREATE TRIGGER trg_platform_admins_updated_at
    BEFORE UPDATE ON public.platform_admins
    FOR EACH ROW EXECUTE PROCEDURE public.platform_admins_set_updated_at();

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
-- Sem policy => acesso apenas via service role.

-- =====================================================================
-- platform_admin_sessions
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.platform_admin_sessions (
    jti          uuid PRIMARY KEY,
    admin_id     uuid NOT NULL REFERENCES public.platform_admins(id) ON DELETE CASCADE,
    ip_address   text,
    user_agent   text,
    issued_at    timestamptz NOT NULL DEFAULT now(),
    expires_at   timestamptz NOT NULL,
    revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_sessions_admin
    ON public.platform_admin_sessions (admin_id);

CREATE INDEX IF NOT EXISTS idx_platform_admin_sessions_active
    ON public.platform_admin_sessions (expires_at) WHERE revoked_at IS NULL;

ALTER TABLE public.platform_admin_sessions ENABLE ROW LEVEL SECURITY;

COMMIT;

-- =====================================================================
-- Validacao
-- =====================================================================
-- Roda apos COMMIT:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name LIKE 'platform_admin%';
--
-- Esperado: 2 linhas — platform_admins e platform_admin_sessions.
