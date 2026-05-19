-- ============================================================
-- WEBINAR — Lock atômico por lead durante processamento do agente
-- ============================================================
-- Problema: lead manda 3 inbounds em sequência rápida ("ok" + "telefone"
-- + "email"). Cada inbound dispara o webhook em paralelo. 3 agentes
-- rodam ao mesmo tempo, todos leem o mesmo histórico, todos decidem
-- mandar a mesma frase → 3-4 mensagens duplicadas em segundos.
--
-- Solução: lock atômico no lead. Apenas UM webhook por vez chama o
-- agente. Os outros viram "lock_held" e só salvam o inbound.
-- O processo que tem o lock vai ver TODAS as inbounds no histórico
-- e responde uma vez só, com contexto completo.
-- ============================================================

ALTER TABLE public.webinar_campaign_leads
    ADD COLUMN IF NOT EXISTS agent_lock_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS agent_lock_token UUID;

COMMENT ON COLUMN public.webinar_campaign_leads.agent_lock_at IS
    'Quando um webhook adquiriu lock pra rodar o agente. NULL = livre. Expira em 60s.';

COMMENT ON COLUMN public.webinar_campaign_leads.agent_lock_token IS
    'Token único do processo que pegou o lock. Pra release seguro (só libera quem pegou).';

CREATE INDEX IF NOT EXISTS idx_webinar_leads_agent_lock_at
    ON public.webinar_campaign_leads (agent_lock_at)
    WHERE agent_lock_at IS NOT NULL;

-- Função: tenta adquirir lock. Retorna o token se conseguiu, NULL se já há lock ativo.
-- Lock expira em 60s — depois disso, outro processo pode tomar.
CREATE OR REPLACE FUNCTION public.webinar_acquire_agent_lock(
    p_lead_id UUID
) RETURNS UUID AS $$
DECLARE
    v_token UUID := gen_random_uuid();
    v_acquired UUID;
BEGIN
    UPDATE public.webinar_campaign_leads
    SET agent_lock_at = NOW(),
        agent_lock_token = v_token
    WHERE id = p_lead_id
      AND (agent_lock_at IS NULL OR agent_lock_at < NOW() - INTERVAL '60 seconds')
    RETURNING agent_lock_token INTO v_acquired;
    RETURN v_acquired;  -- NULL se já estava lockado
END;
$$ LANGUAGE plpgsql;

-- Função: libera lock (só se o token bate, evita race condition de release)
CREATE OR REPLACE FUNCTION public.webinar_release_agent_lock(
    p_lead_id UUID,
    p_token UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_released BOOLEAN := FALSE;
BEGIN
    UPDATE public.webinar_campaign_leads
    SET agent_lock_at = NULL,
        agent_lock_token = NULL
    WHERE id = p_lead_id
      AND agent_lock_token = p_token
    RETURNING TRUE INTO v_released;
    RETURN COALESCE(v_released, FALSE);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.webinar_acquire_agent_lock IS
    'Adquire lock atômico no lead pra processamento do agente. Retorna token (UUID) se conseguiu, NULL se já lockado por outro.';

COMMENT ON FUNCTION public.webinar_release_agent_lock IS
    'Libera o lock se o token bater (proteção contra release indevido).';
