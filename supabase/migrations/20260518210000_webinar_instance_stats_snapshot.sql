-- ============================================================
-- WEBINAR — Instance Stats Snapshot (2026-05-18)
-- ============================================================
-- Tabela de cache pra estatísticas agregadas por instância (chip).
-- A função refresh_webinar_instance_stats(campaign_id) faz UPSERT
-- com agregação completa, baseada em webinar_messages.instance_used
-- + webinar_campaign_leads.last_instance_used.
--
-- Por que cache?
--   - Agregação roda em 3780+ messages: query custosa em real-time
--   - Front lê da tabela direto (latência baixa, sem timeout)
--   - Cron de 1-5min mantém atualizado
-- ============================================================

-- ── 1. Tabela ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webinar_instance_stats_snapshot (
    campaign_id     UUID NOT NULL REFERENCES public.webinar_campaigns(id) ON DELETE CASCADE,
    instance_name   TEXT NOT NULL,

    sent_today      INT NOT NULL DEFAULT 0,
    sent_total      INT NOT NULL DEFAULT 0,
    failed_total    INT NOT NULL DEFAULT 0,
    inbound_total   INT NOT NULL DEFAULT 0,
    replied_leads   INT NOT NULL DEFAULT 0,
    confirmed_leads INT NOT NULL DEFAULT 0,
    attended_leads  INT NOT NULL DEFAULT 0,
    converted_leads INT NOT NULL DEFAULT 0,
    active_leads    INT NOT NULL DEFAULT 0,

    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (campaign_id, instance_name)
);

CREATE INDEX IF NOT EXISTS idx_webinar_instance_stats_snapshot_campaign
    ON public.webinar_instance_stats_snapshot (campaign_id);

COMMENT ON TABLE public.webinar_instance_stats_snapshot IS
    'Snapshot de métricas por chip por campanha. Atualizado por refresh_webinar_instance_stats().';

-- ── 2. Função de refresh ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_webinar_instance_stats(
    p_campaign_id UUID
) RETURNS INT AS $$
DECLARE
    v_today_start TIMESTAMPTZ := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo';
    v_rows INT;
BEGIN
    -- 1. Limpa snapshot antigo dessa campanha
    DELETE FROM public.webinar_instance_stats_snapshot WHERE campaign_id = p_campaign_id;

    -- 2. Insere snapshot novo agregando tudo
    INSERT INTO public.webinar_instance_stats_snapshot (
        campaign_id, instance_name,
        sent_today, sent_total, failed_total, inbound_total,
        replied_leads, confirmed_leads, attended_leads, converted_leads, active_leads,
        snapshot_at
    )
    WITH lead_pool AS (
        SELECT id, last_instance_used, funnel_status
        FROM public.webinar_campaign_leads
        WHERE campaign_id = p_campaign_id
    ),
    msg_stats AS (
        SELECT
            m.instance_used AS instance_name,
            COUNT(*) FILTER (WHERE m.direction = 'outbound'
                             AND m.status IN ('sent','delivered','read')
                             AND m.sent_at >= v_today_start)            AS sent_today,
            COUNT(*) FILTER (WHERE m.direction = 'outbound'
                             AND m.status IN ('sent','delivered','read')) AS sent_total,
            COUNT(*) FILTER (WHERE m.direction = 'outbound'
                             AND m.status = 'failed')                    AS failed_total,
            COUNT(*) FILTER (WHERE m.direction = 'inbound')              AS inbound_total,
            COUNT(DISTINCT m.campaign_lead_id) FILTER (WHERE m.direction = 'inbound') AS replied_leads
        FROM public.webinar_messages m
        JOIN lead_pool l ON l.id = m.campaign_lead_id
        WHERE m.instance_used IS NOT NULL
        GROUP BY m.instance_used
    ),
    lead_stats AS (
        SELECT
            last_instance_used AS instance_name,
            COUNT(*)                                                              AS active_leads,
            COUNT(*) FILTER (WHERE funnel_status IN ('confirmed','attended','converted')) AS confirmed_leads,
            COUNT(*) FILTER (WHERE funnel_status IN ('attended','converted'))     AS attended_leads,
            COUNT(*) FILTER (WHERE funnel_status = 'converted')                   AS converted_leads
        FROM lead_pool
        WHERE last_instance_used IS NOT NULL
        GROUP BY last_instance_used
    ),
    all_instances AS (
        SELECT instance_name FROM msg_stats
        UNION
        SELECT instance_name FROM lead_stats
    )
    SELECT
        p_campaign_id,
        ai.instance_name,
        COALESCE(ms.sent_today, 0),
        COALESCE(ms.sent_total, 0),
        COALESCE(ms.failed_total, 0),
        COALESCE(ms.inbound_total, 0),
        COALESCE(ms.replied_leads, 0),
        COALESCE(ls.confirmed_leads, 0),
        COALESCE(ls.attended_leads, 0),
        COALESCE(ls.converted_leads, 0),
        COALESCE(ls.active_leads, 0),
        NOW()
    FROM all_instances ai
    LEFT JOIN msg_stats ms USING (instance_name)
    LEFT JOIN lead_stats ls USING (instance_name);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.refresh_webinar_instance_stats IS
    'Reagrega snapshot de métricas por chip pra uma campanha. Retorna número de linhas geradas.';

-- ── 3. Função de refresh em massa (todas campanhas ativas) ───────────────
CREATE OR REPLACE FUNCTION public.refresh_webinar_instance_stats_all()
RETURNS INT AS $$
DECLARE
    v_camp RECORD;
    v_total INT := 0;
    v_rows INT;
BEGIN
    FOR v_camp IN
        SELECT id FROM public.webinar_campaigns
        WHERE status IN ('active','paused','ready','finished')
    LOOP
        v_rows := public.refresh_webinar_instance_stats(v_camp.id);
        v_total := v_total + v_rows;
    END LOOP;
    RETURN v_total;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.refresh_webinar_instance_stats_all IS
    'Refresh em massa: roda refresh_webinar_instance_stats pra todas campanhas active/paused/ready/finished.';

-- ── 4. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.webinar_instance_stats_snapshot ENABLE ROW LEVEL SECURITY;

-- Service role bypassa RLS automaticamente. Pra users autenticados,
-- só ver stats de campanhas do tenant deles.
DROP POLICY IF EXISTS webinar_instance_stats_snapshot_select ON public.webinar_instance_stats_snapshot;
CREATE POLICY webinar_instance_stats_snapshot_select ON public.webinar_instance_stats_snapshot
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.webinar_campaigns c
        JOIN public.profiles p ON p.tenant_id = c.tenant_id
        WHERE c.id = webinar_instance_stats_snapshot.campaign_id
          AND p.id = auth.uid()
    )
);
