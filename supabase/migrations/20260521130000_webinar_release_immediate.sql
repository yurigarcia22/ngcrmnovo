-- ============================================================
-- WEBINAR — Release imediato em falha (sem cooldown de 30s)
-- ============================================================
-- Antes: falha → cooldown 30s. Se 6 numeros invalidos em sequencia,
-- todos os 6 chips travam 30s e proximos 18 leads pegam
-- 'all_instances_unavailable'.
--
-- Agora: falha → libera IMEDIATAMENTE (next_available_at=NOW).
-- O chip nao tem culpa do numero ser invalido; nao deve sofrer
-- cooldown pelo erro do lead.
-- ============================================================

CREATE OR REPLACE FUNCTION release_webinar_instance_on_failure(
    p_instance_name TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE public.webinar_instance_state
    SET daily_sent_count = GREATEST(0, daily_sent_count - 1),
        next_available_at = NOW()  -- libera imediatamente
    WHERE instance_name = p_instance_name;
END;
$$ LANGUAGE plpgsql;
