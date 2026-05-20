-- ============================================================
-- WEBINAR — Cap diário configurável por campanha
-- ============================================================
-- Antes: cap diário era fixo no webinar_instance_state (40/chip).
-- Agora: campanha pode override pra valor custom (30, 50, 100, etc).
--
-- Mesmo chip pode ser usado por campanhas diferentes com caps
-- diferentes — a função claim aceita parametro de override.
-- ============================================================

ALTER TABLE public.webinar_campaigns
    ADD COLUMN IF NOT EXISTS daily_cap_per_instance INT;

COMMENT ON COLUMN public.webinar_campaigns.daily_cap_per_instance IS
    'Override do cap diario por instancia para esta campanha. NULL = usa o cap do instance_state (default 40).';

-- Constraint sanity check: cap entre 1 e 1000
ALTER TABLE public.webinar_campaigns
    DROP CONSTRAINT IF EXISTS webinar_campaigns_daily_cap_check;
ALTER TABLE public.webinar_campaigns
    ADD CONSTRAINT webinar_campaigns_daily_cap_check
    CHECK (daily_cap_per_instance IS NULL OR (daily_cap_per_instance >= 1 AND daily_cap_per_instance <= 1000));

-- Dropa versao antiga (signature diferente) pra evitar overload ambiguo
DROP FUNCTION IF EXISTS claim_webinar_instance(TEXT);

-- Recria claim_webinar_instance com override opcional.
-- Quando p_cap_override eh passado, ele substitui o cap padrao do instance_state
-- (mas warmup ainda se aplica se chip nao tem skip_warmup).
CREATE OR REPLACE FUNCTION claim_webinar_instance(
    p_instance_name TEXT,
    p_cap_override INT DEFAULT NULL
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

    -- Base cap: override da campanha tem prioridade sobre daily_cap do state
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

    v_jitter := v_state.min_jitter_seconds
                + floor(random() * (v_state.max_jitter_seconds - v_state.min_jitter_seconds + 1))::int;

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

COMMENT ON FUNCTION claim_webinar_instance(TEXT, INT) IS
    'Claim atomico de instancia. p_cap_override permite cada campanha definir seu proprio cap (30, 50, 100, etc). Warmup ainda se aplica sobre o override.';
