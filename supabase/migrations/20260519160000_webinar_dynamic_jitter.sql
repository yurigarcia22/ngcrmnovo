-- ============================================================
-- WEBINAR — Jitter dinâmico no claim
-- ============================================================
-- claim_webinar_instance agora aceita overrides de jitter min/max.
-- Permite calcular o intervalo entre disparos baseado no cap diário
-- e na janela util do dia (ex: cap 80 + janela 360min → 4.5min/disparo)
-- ============================================================

DROP FUNCTION IF EXISTS claim_webinar_instance(TEXT, INT);

CREATE OR REPLACE FUNCTION claim_webinar_instance(
    p_instance_name TEXT,
    p_cap_override INT DEFAULT NULL,
    p_min_jitter_seconds INT DEFAULT NULL,
    p_max_jitter_seconds INT DEFAULT NULL
) RETURNS TABLE (
    granted BOOLEAN,
    daily_sent INT,
    daily_cap INT,
    next_available_at TIMESTAMPTZ,
    reason TEXT
) AS $$
DECLARE
    v_state public.webinar_instance_state%ROWTYPE;
    v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
    v_jitter INT;
    v_min_jitter INT;
    v_max_jitter INT;
    v_warmup_days INT;
    v_warmup_cap INT;
    v_effective_cap INT;
    v_base_cap INT;
BEGIN
    INSERT INTO public.webinar_instance_state (instance_name)
    VALUES (p_instance_name)
    ON CONFLICT (instance_name) DO NOTHING;

    SELECT * INTO v_state
    FROM public.webinar_instance_state
    WHERE instance_name = p_instance_name
    FOR UPDATE;

    IF v_state.status <> 'active' THEN
        granted := FALSE;
        daily_sent := v_state.daily_sent_count;
        daily_cap := v_state.daily_cap;
        next_available_at := v_state.next_available_at;
        reason := 'instance_status_' || v_state.status;
        RETURN NEXT;
        RETURN;
    END IF;

    IF v_state.daily_reset_date < v_today THEN
        v_state.daily_sent_count := 0;
        v_state.daily_reset_date := v_today;
    END IF;

    v_base_cap := COALESCE(p_cap_override, v_state.daily_cap);

    IF v_state.skip_warmup THEN
        v_effective_cap := v_base_cap;
    ELSE
        v_warmup_days := GREATEST(0, (v_today - (v_state.warmup_started_at AT TIME ZONE 'America/Sao_Paulo')::date));
        IF v_warmup_days < 3 THEN
            v_warmup_cap := 10;
        ELSIF v_warmup_days < 7 THEN
            v_warmup_cap := 20;
        ELSIF v_warmup_days < 14 THEN
            v_warmup_cap := 35;
        ELSE
            v_warmup_cap := v_base_cap;
        END IF;
        v_effective_cap := LEAST(v_base_cap, v_warmup_cap);
    END IF;

    IF v_state.daily_sent_count >= v_effective_cap THEN
        granted := FALSE;
        daily_sent := v_state.daily_sent_count;
        daily_cap := v_effective_cap;
        next_available_at := v_state.next_available_at;
        reason := 'daily_cap_reached';
        RETURN NEXT;
        RETURN;
    END IF;

    IF v_state.next_available_at > NOW() THEN
        granted := FALSE;
        daily_sent := v_state.daily_sent_count;
        daily_cap := v_effective_cap;
        next_available_at := v_state.next_available_at;
        reason := 'cooldown';
        RETURN NEXT;
        RETURN;
    END IF;

    v_min_jitter := COALESCE(p_min_jitter_seconds, v_state.min_jitter_seconds);
    v_max_jitter := COALESCE(p_max_jitter_seconds, v_state.max_jitter_seconds);
    IF v_min_jitter < 30 THEN v_min_jitter := 30; END IF;
    IF v_max_jitter < v_min_jitter THEN v_max_jitter := v_min_jitter; END IF;

    v_jitter := v_min_jitter + floor(random() * (v_max_jitter - v_min_jitter + 1))::int;

    UPDATE public.webinar_instance_state
    SET daily_sent_count = v_state.daily_sent_count + 1,
        daily_reset_date = v_state.daily_reset_date,
        next_available_at = NOW() + (v_jitter || ' seconds')::interval,
        last_sent_at = NOW()
    WHERE instance_name = p_instance_name;

    granted := TRUE;
    daily_sent := v_state.daily_sent_count + 1;
    daily_cap := v_effective_cap;
    next_available_at := NOW() + (v_jitter || ' seconds')::interval;
    reason := 'ok';
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_webinar_instance(TEXT, INT, INT, INT) IS
    'Claim atomico com cap_override + jitter_override. Permite cada campanha definir cap e intervalo entre disparos. Floor de 30s no jitter mínimo (anti-ban).';
