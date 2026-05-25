-- ============================================================
-- PHASE 2 — TABELA tenant_modules + BACKFILL + TRIGGER
-- ============================================================
-- Feature flags por tenant. Cada modulo do CRM (dashboard, leads,
-- chat, cold_call, webinar, emails, whatsapp_connect) tem um
-- registro por tenant com flag enabled e config jsonb opcional.
--
-- Modulos sao identificados por module_key (text) — adicionar
-- novo modulo no futuro = inserir nova linha, sem migration.
-- ============================================================

-- 1. Tabela tenant_modules
CREATE TABLE IF NOT EXISTS public.tenant_modules (
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    module_key  text NOT NULL,
    enabled     boolean NOT NULL DEFAULT false,
    config      jsonb NOT NULL DEFAULT '{}'::jsonb,
    enabled_at  timestamptz,
    disabled_at timestamptz,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  uuid,
    -- updated_by referencia platform_admins(id) mas sem FK pq pode
    -- ser null em casos de seed/auto-criacao via trigger.

    PRIMARY KEY (tenant_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_modules_enabled
    ON public.tenant_modules (tenant_id, enabled);

-- 2. Trigger updated_at + transicao enabled_at/disabled_at
CREATE OR REPLACE FUNCTION public.tenant_modules_track_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();

    -- Marcar timestamps de transicao apenas quando enabled muda
    IF TG_OP = 'INSERT' THEN
        IF NEW.enabled THEN
            NEW.enabled_at := now();
        ELSE
            NEW.disabled_at := now();
        END IF;
    ELSIF TG_OP = 'UPDATE' AND OLD.enabled IS DISTINCT FROM NEW.enabled THEN
        IF NEW.enabled THEN
            NEW.enabled_at := now();
            NEW.disabled_at := NULL;
        ELSE
            NEW.disabled_at := now();
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_modules_track ON public.tenant_modules;
CREATE TRIGGER trg_tenant_modules_track
    BEFORE INSERT OR UPDATE ON public.tenant_modules
    FOR EACH ROW EXECUTE PROCEDURE public.tenant_modules_track_changes();

-- 3. RLS
ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;

-- Cliente do CRM ve apenas modulos do proprio tenant (read-only).
DROP POLICY IF EXISTS "tenant_modules_select_own" ON public.tenant_modules;
CREATE POLICY "tenant_modules_select_own" ON public.tenant_modules
    FOR SELECT USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

-- INSERT/UPDATE/DELETE: nenhuma policy => apenas service role
-- (chamado pelo /admin) consegue modificar.

-- 4. BACKFILL — todos os tenants existentes recebem TODOS os modulos
--    com enabled=true (para nao quebrar quem ja usa o sistema).
INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
SELECT t.id, m.module_key, true
FROM public.tenants t
CROSS JOIN (VALUES
    ('dashboard'),
    ('leads'),
    ('chat'),
    ('cold_call'),
    ('webinar'),
    ('emails'),
    ('whatsapp_connect')
) AS m(module_key)
ON CONFLICT (tenant_id, module_key) DO NOTHING;

-- 5. ATUALIZAR handle_new_user PARA SEEDAR MODULOS DEFAULT
--    Quando um tenant novo e criado, recebe automaticamente:
--      dashboard + leads + chat + whatsapp_connect => enabled
--      cold_call + webinar + emails => disabled (opt-in via /admin)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_tenant_id uuid;
  invited_tenant_id uuid;
  meta_role text;
BEGIN
  invited_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;
  meta_role := new.raw_user_meta_data->>'role';

  IF invited_tenant_id IS NOT NULL THEN
    -- CASO 1: CONVITE para tenant existente
    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (
      new.id,
      invited_tenant_id,
      COALESCE(meta_role, 'vendedor'),
      new.raw_user_meta_data->>'full_name'
    );

  ELSE
    -- CASO 2: SIGNUP NOVO -> Cria nova empresa
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

    -- Seed dos modulos: 4 ligados, 3 desligados (opt-in)
    INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
    VALUES
      (new_tenant_id, 'dashboard',         true),
      (new_tenant_id, 'leads',             true),
      (new_tenant_id, 'chat',              true),
      (new_tenant_id, 'whatsapp_connect',  true),
      (new_tenant_id, 'cold_call',         false),
      (new_tenant_id, 'webinar',           false),
      (new_tenant_id, 'emails',            false);

  END IF;

  RETURN new;
END;
$$;

-- A trigger on_auth_user_created ja existe e aponta para esta funcao.
