-- ============================================================
-- PHASE 0 / STEP 1 — CLEANUP DOS TENANTS ZUMBIS
-- ============================================================
-- Remove 4 tenants criados durante testes que nao tem dados
-- relevantes. Os IDs estao hardcoded de proposito para evitar
-- estragar producao se alguem rodar isso em outro ambiente.
--
-- Tenants alvo:
--   aa1ccc09-405d-40e5-b61c-cddbcfc4a0a6  "Minha Empresa" (vazio)
--   e71da085-2cc2-4a0e-8b40-8e067600d808  "Minha Empresa" (vazio)
--   0b19ee20-0cd1-4bbd-9023-56639638e25f  "Minha Empresa" (vazio)
--   dbbf3665-ff4d-479f-a652-323120bba9eb  "Minha Empresa" (Teste1 + 1 pipeline)
-- ============================================================

DO $$
DECLARE
    zombie_ids uuid[] := ARRAY[
        'aa1ccc09-405d-40e5-b61c-cddbcfc4a0a6'::uuid,
        'e71da085-2cc2-4a0e-8b40-8e067600d808'::uuid,
        '0b19ee20-0cd1-4bbd-9023-56639638e25f'::uuid,
        'dbbf3665-ff4d-479f-a652-323120bba9eb'::uuid
    ];
    zombie_id uuid;
    zombie_user_ids uuid[];
BEGIN
    -- Coletar user_ids ligados a esses tenants antes de apagar profiles
    SELECT array_agg(id) INTO zombie_user_ids
    FROM public.profiles
    WHERE tenant_id = ANY(zombie_ids);

    -- 1. Apagar tudo que tem FK em pipelines/stages/profiles do tenant alvo.
    --    Como os tenants estao vazios em deals/contacts/etc, basicamente
    --    so precisamos remover stages -> pipelines -> profiles -> tenants.

    DELETE FROM public.stages
    WHERE pipeline_id IN (
        SELECT id FROM public.pipelines WHERE tenant_id = ANY(zombie_ids)
    );

    DELETE FROM public.pipelines WHERE tenant_id = ANY(zombie_ids);
    DELETE FROM public.profiles  WHERE tenant_id = ANY(zombie_ids);
    DELETE FROM public.tenants   WHERE id        = ANY(zombie_ids);

    -- 2. Apagar usuarios orfaos no auth.users. Isso so funciona via SQL
    --    porque a migration roda como superuser.
    IF zombie_user_ids IS NOT NULL AND array_length(zombie_user_ids, 1) > 0 THEN
        DELETE FROM auth.users WHERE id = ANY(zombie_user_ids);
    END IF;

    RAISE NOTICE 'Cleanup zumbis: % tenants removidos, % usuarios removidos.',
        array_length(zombie_ids, 1),
        COALESCE(array_length(zombie_user_ids, 1), 0);
END $$;
