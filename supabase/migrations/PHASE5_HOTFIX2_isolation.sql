-- =====================================================================
-- HOTFIX 2 — ISOLAMENTO DE TENANT + STAGES ORFAS
-- =====================================================================
-- Bugs corrigidos:
--   1. tags, loss_reasons e contacts NAO tinham RLS estrita
--      (anon key conseguia ler dados de todos os tenants)
--
--   2. handle_new_user inseria stages sem tenant_id explicito.
--      Como stages.tenant_id tem DEFAULT '00000000-...', as stages
--      dos tenants novos foram criadas pertencendo ao GRUPO NG.
--      Resultado: tenant novo nao via o proprio pipeline.
--
--   3. Mesmo problema potencial em outras tabelas que tenham
--      DEFAULT no tenant_id e sejam inseridas sem ele.
--
-- Acoes:
--   A. Habilitar RLS + policies em tags, loss_reasons, contacts
--   B. Corrigir tenant_id de stages cujo pipeline pertence a outro
--      tenant (UPDATE join pipelines)
--   C. Reescrever handle_new_user passando tenant_id explicito
--      em todos os INSERTs filhos
-- =====================================================================

BEGIN;

-- =====================================================================
-- A) RLS POLICIES — tags, loss_reasons, contacts
-- =====================================================================

-- ---- tags ----
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tags_tenant_isolation" ON public.tags;
CREATE POLICY "tags_tenant_isolation" ON public.tags
    FOR ALL USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ))
    WITH CHECK (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

-- ---- loss_reasons ----
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loss_reasons_tenant_isolation" ON public.loss_reasons;
CREATE POLICY "loss_reasons_tenant_isolation" ON public.loss_reasons
    FOR ALL USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ))
    WITH CHECK (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

-- ---- contacts ----
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_tenant_isolation" ON public.contacts;
CREATE POLICY "contacts_tenant_isolation" ON public.contacts
    FOR ALL USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ))
    WITH CHECK (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

-- =====================================================================
-- B) FIX STAGES ORFAS — adotar o tenant_id do pipeline parent
-- =====================================================================
-- Para qualquer stage cujo tenant_id != pipeline.tenant_id, corrige
-- usando o tenant_id real do pipeline.
UPDATE public.stages s
SET tenant_id = p.tenant_id
FROM public.pipelines p
WHERE s.pipeline_id = p.id
  AND s.tenant_id IS DISTINCT FROM p.tenant_id;

-- =====================================================================
-- C) REESCREVER handle_new_user PASSANDO tenant_id EXPLICITO
-- =====================================================================
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
    -- CONVITE: tenant ja existe
    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (
      new.id,
      invited_tenant_id,
      COALESCE(meta_role, 'vendedor'),
      new.raw_user_meta_data->>'full_name'
    );

  ELSE
    -- SIGNUP NOVO
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

    -- Modulos default
    INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
    VALUES
      (new_tenant_id, 'dashboard',         true),
      (new_tenant_id, 'leads',             true),
      (new_tenant_id, 'chat',              true),
      (new_tenant_id, 'whatsapp_connect',  true),
      (new_tenant_id, 'cold_call',         false),
      (new_tenant_id, 'webinar',           false),
      (new_tenant_id, 'emails',            false);

    -- Pipeline default
    INSERT INTO public.pipelines (tenant_id, name, is_default)
    VALUES (new_tenant_id, 'Funil de Vendas', true)
    RETURNING id INTO new_pipeline_id;

    -- Stages (AGORA passando tenant_id explicito + color default)
    INSERT INTO public.stages (pipeline_id, tenant_id, name, position, is_inbox, color)
    VALUES
      (new_pipeline_id, new_tenant_id, 'Lead Entrada', 0, true,  '#6366f1'),
      (new_pipeline_id, new_tenant_id, 'Qualificacao', 1, false, '#3b82f6'),
      (new_pipeline_id, new_tenant_id, 'Negociacao',   2, false, '#fbbf24'),
      (new_pipeline_id, new_tenant_id, 'Fechamento',   3, false, '#22c55e');

    -- Loss reasons default
    INSERT INTO public.loss_reasons (tenant_id, name)
    VALUES
      (new_tenant_id, 'Sem orcamento'),
      (new_tenant_id, 'Comprou do concorrente'),
      (new_tenant_id, 'Nao era o momento'),
      (new_tenant_id, 'Nao engajou');

    -- Tags default
    INSERT INTO public.tags (tenant_id, name, color)
    VALUES
      (new_tenant_id, 'Quente',  '#ef4444'),
      (new_tenant_id, 'Morno',   '#f59e0b'),
      (new_tenant_id, 'Frio',    '#3b82f6');
  END IF;

  RETURN new;
END;
$$;

COMMIT;

-- =====================================================================
-- VALIDACAO POS-RUN:
-- =====================================================================
-- 1. Stages corrigidas?
--    SELECT s.pipeline_id, s.tenant_id, p.tenant_id AS pipeline_tenant
--    FROM stages s JOIN pipelines p ON p.id = s.pipeline_id
--    WHERE s.tenant_id != p.tenant_id;
--    (deve retornar 0 linhas)
--
-- 2. RLS funcionando? (via anon key, nao deve vazar nada)
--    Teste via app: outro tenant nao deve ver tags do GRUPO NG.
