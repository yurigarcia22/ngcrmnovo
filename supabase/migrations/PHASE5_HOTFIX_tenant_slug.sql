-- =====================================================================
-- HOTFIX URGENTE — handle_new_user falhava no signup novo
-- =====================================================================
-- Bug: a coluna tenants.slug e NOT NULL desde a Fase 0, mas o
-- handle_new_user fazia INSERT INTO tenants (name) sem preencher slug.
-- Resultado: todo signup novo quebrava com "null value in column slug".
--
-- Fix: trigger BEFORE INSERT em tenants que gera slug automaticamente
-- se vier null/vazio.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.tenants_generate_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        -- Gera slug: nome lowercased + hifen + primeiros 8 chars do uuid
        NEW.slug := LOWER(
            REGEXP_REPLACE(COALESCE(NEW.name, 'tenant'), '[^a-zA-Z0-9]+', '-', 'g')
        ) || '-' || SUBSTRING(NEW.id::text, 1, 8);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_generate_slug ON public.tenants;
CREATE TRIGGER trg_tenants_generate_slug
    BEFORE INSERT ON public.tenants
    FOR EACH ROW EXECUTE PROCEDURE public.tenants_generate_slug();

COMMIT;

-- =====================================================================
-- VALIDACAO POS-RUN:
-- =====================================================================
-- a) Trigger criada?
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.tenants'::regclass
--      AND tgname = 'trg_tenants_generate_slug';
--
-- b) Testar signup novamente (no app ou via API).
--    Esperado: tenant criado, slug preenchido automaticamente.
