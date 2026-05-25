-- ============================================================
-- PHASE 1 — TABELA platform_admins
-- ============================================================
-- Tabela de usuarios super-admin da plataforma. Totalmente
-- separada do auth.users (que e usado pelos clientes do CRM).
-- Acesso apenas via service role do backend (/admin/*).
-- ============================================================

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

-- Index para buscar por email no login
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_admins_email_active
    ON public.platform_admins (lower(email)) WHERE is_active = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.platform_admins_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_admins_updated_at ON public.platform_admins;
CREATE TRIGGER trg_platform_admins_updated_at
    BEFORE UPDATE ON public.platform_admins
    FOR EACH ROW EXECUTE PROCEDURE public.platform_admins_set_updated_at();

-- RLS: BLOQUEAR TUDO via authenticated. Acesso somente service role.
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Nenhuma policy criada => nenhum usuario autenticado (do CRM) consegue
-- ler/escrever nessa tabela. Service role (backend do /admin) bypassa RLS.

-- ============================================================
-- TABELA platform_admin_sessions (opcional: audit de login)
-- ============================================================
-- Guarda jti do JWT emitido para permitir revogar token especifico
-- (logout em outro dispositivo, suspeita de roubo).
-- ============================================================

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
-- Sem policy => apenas service role acessa.
