-- ============================================================
-- PRODUCTS RLS — 2026-05-27
-- ============================================================
-- A tabela products tinha RLS habilitado mas NENHUMA policy,
-- bloqueando completamente inserts/selects do app ("erro de banco
-- de dados" ao tentar cadastrar produto em /settings/products).
--
-- Aplicado via Management API. Este arquivo eh historico.

DROP POLICY IF EXISTS "products_tenant_isolation" ON public.products;

CREATE POLICY "products_tenant_isolation" ON public.products
    FOR ALL
    USING (tenant_id = (SELECT public.current_tenant_id()))
    WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
