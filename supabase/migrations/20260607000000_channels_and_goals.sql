-- =====================================================================
-- Canais de Aquisicao + Metas (individual e geral)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CANAIS DE AQUISICAO
--    Lista configuravel por tenant. Cada deal pode ter 1 canal.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.acquisition_channels (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name        text NOT NULL,
    color       text NOT NULL DEFAULT '#6366f1',
    position    integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acq_channels_tenant ON public.acquisition_channels(tenant_id);

ALTER TABLE public.acquisition_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acq_channels_tenant_isolation" ON public.acquisition_channels;
CREATE POLICY "acq_channels_tenant_isolation" ON public.acquisition_channels
    FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- Coluna no deal apontando para o canal (nullable; SET NULL ao deletar o canal).
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS acquisition_channel_id uuid
    REFERENCES public.acquisition_channels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_acq_channel ON public.deals(acquisition_channel_id);

-- ---------------------------------------------------------------------
-- 2. METAS (goals)
--    user_id NULL  -> meta GERAL do tenant (so admin ve)
--    user_id setado -> meta INDIVIDUAL do vendedor (cada um ve a sua)
--    period         -> 1o dia do mes (metas mensais)
--    3 metricas: valor vendido (R$), ligacoes feitas, reunioes marcadas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goals (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id          uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    period           date NOT NULL,
    target_revenue   numeric NOT NULL DEFAULT 0,
    target_calls     integer NOT NULL DEFAULT 0,
    target_meetings  integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_tenant_period ON public.goals(tenant_id, period);

-- Unicidade: 1 meta geral por (tenant, mes) e 1 meta individual por (tenant, user, mes).
-- Indices parciais porque NULL nao colide em UNIQUE comum.
CREATE UNIQUE INDEX IF NOT EXISTS uq_goals_general
    ON public.goals(tenant_id, period) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_goals_user
    ON public.goals(tenant_id, user_id, period) WHERE user_id IS NOT NULL;

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "goals_tenant_isolation" ON public.goals;
CREATE POLICY "goals_tenant_isolation" ON public.goals
    FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
