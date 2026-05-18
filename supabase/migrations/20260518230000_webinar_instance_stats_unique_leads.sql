-- ============================================================
-- WEBINAR — Stats por instância: adiciona contagem de leads únicos
-- ============================================================
-- HOJE/TOTAL contam mensagens (com follow-ups duplica). Adiciono
-- coluna pra mostrar quantos leads UNICOS cada chip abordou.
-- ============================================================

ALTER TABLE public.webinar_instance_stats_snapshot
    ADD COLUMN IF NOT EXISTS unique_leads_total INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS unique_leads_today INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.webinar_instance_stats_snapshot.unique_leads_total IS
    'Contagem distinta de leads que receberam ao menos 1 mensagem outbound enviada por esse chip.';

COMMENT ON COLUMN public.webinar_instance_stats_snapshot.unique_leads_today IS
    'Contagem distinta de leads abordados hoje (00:00 BRT) por esse chip.';

-- Recria função de refresh incluindo COUNT(DISTINCT)
CREATE OR REPLACE FUNCTION public.refresh_webinar_instance_stats(
    p_campaign_id UUID
) RETURNS INT AS $$
DECLARE
    v_today_start TIMESTAMPTZ := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AT TIME ZONE 'America/Sao_Paulo';
    v_rows INT;
BEGIN
    DELETE FROM public.webinar_instance_stats_snapshot WHERE campaign_id = p_campaign_id;

    INSERT INTO public.webinar_instance_stats_snapshot (
        campaign_id, instance_name,
        sent_today, sent_total, failed_total, inbound_total,
        unique_leads_today, unique_leads_total,
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
            COUNT(DISTINCT m.campaign_lead_id) FILTER (WHERE m.direction = 'inbound') AS replied_leads,
            COUNT(DISTINCT m.campaign_lead_id) FILTER (
                WHERE m.direction = 'outbound'
                  AND m.status IN ('sent','delivered','read')
            ) AS unique_leads_total,
            COUNT(DISTINCT m.campaign_lead_id) FILTER (
                WHERE m.direction = 'outbound'
                  AND m.status IN ('sent','delivered','read')
                  AND m.sent_at >= v_today_start
            ) AS unique_leads_today
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
        COALESCE(ms.unique_leads_today, 0),
        COALESCE(ms.unique_leads_total, 0),
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
