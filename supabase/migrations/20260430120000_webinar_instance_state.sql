-- ============================================================
-- WEBINAR — Instance state (jitter por instância + cap diário)
-- ============================================================
-- Cada instância Evolution mantém seu próprio "relógio" de envio:
--   - next_available_at: quando ela pode disparar a próxima mensagem
--   - daily_sent_count: quantas saíram hoje (cap anti-ban)
--   - daily_reset_date: data do contador (reseta na virada do dia)
--   - status: active | paused | banned
--   - jitter min/max: faixa de espera entre disparos (default 4-9min, modo SEGURO)
--
-- Cap default 101 disparos/chip/dia (corresponde a jitter 4-9min em 11h de janela).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webinar_instance_state (
    instance_name TEXT PRIMARY KEY,
    next_available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    daily_sent_count INT NOT NULL DEFAULT 0,
    daily_reset_date DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date,
    daily_cap INT NOT NULL DEFAULT 101,
    min_jitter_seconds INT NOT NULL DEFAULT 240,  -- 4 min
    max_jitter_seconds INT NOT NULL DEFAULT 540,  -- 9 min
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'banned')),
    last_sent_at TIMESTAMPTZ,
    paused_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wis_status_next
    ON public.webinar_instance_state (status, next_available_at);

COMMENT ON TABLE public.webinar_instance_state IS
    'Estado por instância Evolution para dispatch controlado. Cada instância tem seu próprio next_available_at, daily_cap e jitter range.';

COMMENT ON COLUMN public.webinar_instance_state.next_available_at IS
    'Quando a instância pode disparar a próxima mensagem. Atualizado após cada envio: NOW() + random(min_jitter, max_jitter).';

COMMENT ON COLUMN public.webinar_instance_state.daily_cap IS
    'Limite duro de disparos por dia (anti-ban). Default 101 = modo SEGURO (jitter 4-9min em janela 9h-20h).';

COMMENT ON COLUMN public.webinar_instance_state.daily_reset_date IS
    'Data do daily_sent_count atual. Quando muda (timezone America/Sao_Paulo), o contador é zerado no próximo dispatch.';

-- ============================================================
-- Trigger pra manter updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_webinar_instance_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wis_updated_at ON public.webinar_instance_state;
CREATE TRIGGER trg_wis_updated_at
    BEFORE UPDATE ON public.webinar_instance_state
    FOR EACH ROW
    EXECUTE FUNCTION update_webinar_instance_state_timestamp();

-- ============================================================
-- Função utilitária: claim_instance(name)
--   - Se cap atingido OU paused/banned: retorna NULL
--   - Se daily_reset_date é antiga: zera contador
--   - Senão: incrementa daily_sent_count, atualiza next_available_at, retorna nome
--   - É atomic (FOR UPDATE) pra evitar race em runs concorrentes do dispatcher
-- ============================================================
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
BEGIN
    -- Garante que existe registro pra essa instância (UPSERT defensivo)
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

    -- Cap diário
    IF v_state.daily_sent_count >= v_state.daily_cap THEN
        granted := FALSE;
        daily_sent := v_state.daily_sent_count;
        daily_cap := v_state.daily_cap;
        next_available_at := v_state.next_available_at;
        reason := 'daily_cap_reached';
        RETURN NEXT;
        RETURN;
    END IF;

    -- Janela de tempo
    IF v_state.next_available_at > NOW() THEN
        granted := FALSE;
        daily_sent := v_state.daily_sent_count;
        daily_cap := v_state.daily_cap;
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
    daily_cap := v_state.daily_cap;
    next_available_at := NOW() + (v_jitter || ' seconds')::interval;
    reason := 'ok';
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION claim_webinar_instance IS
    'Claim atômico de uma instância para envio. Retorna granted=true se a instância está pronta (status active, dentro do cap, cooldown vencido). Atualiza next_available_at automaticamente.';

-- ============================================================
-- Função utilitária: release_webinar_instance_on_failure
--   - Quando o envio falha após o claim, devolve o slot:
--     decrementa daily_sent_count e recua next_available_at em 30s
--     (pra retry rápido sem queimar capacidade)
-- ============================================================
CREATE OR REPLACE FUNCTION release_webinar_instance_on_failure(
    p_instance_name TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE public.webinar_instance_state
    SET daily_sent_count = GREATEST(0, daily_sent_count - 1),
        next_available_at = NOW() + INTERVAL '30 seconds'
    WHERE instance_name = p_instance_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION release_webinar_instance_on_failure IS
    'Reverte o claim quando o envio falha. Decrementa contador e libera a instância em 30s pra retry.';
