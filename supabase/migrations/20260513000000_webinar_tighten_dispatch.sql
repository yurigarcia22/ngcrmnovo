-- ============================================================
-- WEBINAR — Tighten dispatch (anti-ban v2, 2026-05-13)
-- ============================================================
-- Reduz agressividade dos disparos pra diminuir risco de queda em cascata:
--
--   Cap diário:   101 → 40 disparos/chip/dia
--   Jitter:       4-9 min → 8-18 min entre disparos
--   Warmup:       chip novo começa com cap reduzido (10/20/35) por 14 dias
--   Quality:      coluna pra rastrear taxa de resposta dos últimos 7 dias
--
-- Chips JÁ existentes recebem skip_warmup=TRUE e warmup_started_at
-- recuado em 30 dias pra não regredirem.
-- ============================================================

-- ── 1. Adiciona colunas novas ────────────────────────────────────────────
ALTER TABLE public.webinar_instance_state
    ADD COLUMN IF NOT EXISTS warmup_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS skip_warmup BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS reply_rate_7d NUMERIC;

COMMENT ON COLUMN public.webinar_instance_state.warmup_started_at IS
    'Quando o chip começou warmup. Cap progressivo: dias 0-2 = 10, 3-6 = 20, 7-13 = 35, 14+ = cap cheio.';

COMMENT ON COLUMN public.webinar_instance_state.skip_warmup IS
    'TRUE = chip já aquecido (veterano), pula curva de warmup e usa daily_cap direto.';

COMMENT ON COLUMN public.webinar_instance_state.reply_rate_7d IS
    'Taxa de resposta dos últimos 7 dias (0..1). Atualizada pela cron quality-score. Se baixa, daily_cap é reduzido.';

-- ── 2. Reduz cap e aumenta jitter (chips existentes) ─────────────────────
UPDATE public.webinar_instance_state
SET daily_cap = LEAST(daily_cap, 40),
    min_jitter_seconds = GREATEST(min_jitter_seconds, 480),
    max_jitter_seconds = GREATEST(max_jitter_seconds, 1080);

-- ── 3. Marca chips existentes como aquecidos ─────────────────────────────
-- (skip_warmup = TRUE pra eles não regredirem pra cap baixo).
UPDATE public.webinar_instance_state
SET skip_warmup = TRUE,
    warmup_started_at = NOW() - INTERVAL '30 days';

-- ── 4. Altera defaults pra refletir os novos valores ─────────────────────
ALTER TABLE public.webinar_instance_state
    ALTER COLUMN daily_cap SET DEFAULT 40,
    ALTER COLUMN min_jitter_seconds SET DEFAULT 480,
    ALTER COLUMN max_jitter_seconds SET DEFAULT 1080;

-- ── 5. Recria claim_webinar_instance com lógica de warmup ────────────────
-- Cap efetivo é o MENOR entre daily_cap e o cap-de-warmup baseado em
-- dias desde warmup_started_at (a menos que skip_warmup=TRUE).
CREATE OR REPLACE FUNCTION claim_webinar_instance(
    p_instance_name TEXT
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
BEGIN
    -- Garante que existe registro pra essa instância
    INSERT INTO public.webinar_instance_state (instance_name)
    VALUES (p_instance_name)
    ON CONFLICT (instance_name) DO NOTHING;

    -- Lock exclusivo na linha
    SELECT * INTO v_state
    FROM public.webinar_instance_state
    WHERE instance_name = p_instance_name
    FOR UPDATE;

    -- Status check
    IF v_state.status <> 'active' THEN
        granted := FALSE;
        daily_sent := v_state.daily_sent_count;
        daily_cap := v_state.daily_cap;
        next_available_at := v_state.next_available_at;
        reason := 'instance_status_' || v_state.status;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Reset diário se virou o dia
    IF v_state.daily_reset_date < v_today THEN
        v_state.daily_sent_count := 0;
        v_state.daily_reset_date := v_today;
    END IF;

    -- Calcula cap efetivo considerando warmup
    IF v_state.skip_warmup THEN
        v_effective_cap := v_state.daily_cap;
    ELSE
        v_warmup_days := GREATEST(0, (v_today - (v_state.warmup_started_at AT TIME ZONE 'America/Sao_Paulo')::date));
        IF v_warmup_days < 3 THEN
            v_warmup_cap := 10;
        ELSIF v_warmup_days < 7 THEN
            v_warmup_cap := 20;
        ELSIF v_warmup_days < 14 THEN
            v_warmup_cap := 35;
        ELSE
            v_warmup_cap := v_state.daily_cap;
        END IF;
        v_effective_cap := LEAST(v_state.daily_cap, v_warmup_cap);
    END IF;

    -- Cap diário (efetivo)
    IF v_state.daily_sent_count >= v_effective_cap THEN
        granted := FALSE;
        daily_sent := v_state.daily_sent_count;
        daily_cap := v_effective_cap;
        next_available_at := v_state.next_available_at;
        reason := 'daily_cap_reached';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Janela de tempo
    IF v_state.next_available_at > NOW() THEN
        granted := FALSE;
        daily_sent := v_state.daily_sent_count;
        daily_cap := v_effective_cap;
        next_available_at := v_state.next_available_at;
        reason := 'cooldown';
        RETURN NEXT;
        RETURN;
    END IF;

    -- TUDO OK: incrementa, recalcula next_available_at e retorna granted
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

COMMENT ON FUNCTION claim_webinar_instance IS
    'Claim atômico com cap efetivo de warmup. Chips com skip_warmup=FALSE recebem cap progressivo (10/20/35) nos primeiros 14 dias desde warmup_started_at.';
