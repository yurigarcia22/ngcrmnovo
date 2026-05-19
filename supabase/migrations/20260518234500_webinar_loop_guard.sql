-- ============================================================
-- WEBINAR — Stop-loss DB-level contra loops de auto-reply
-- ============================================================
-- Camada de defesa em profundidade: mesmo que o webhook falhe em
-- detectar um auto-reply novo (template do WhatsApp Business que
-- ainda nao mapeamos), o banco pausa o lead automaticamente quando
-- detecta padrao de loop.
--
-- Critério:
--   - >=3 outbound 'agent_reply' enviados nos últimos 5min
--   - SEM inbound humano real no meio (texto > 10 chars que nao
--     bate padroes obvios de auto-reply)
-- ============================================================

-- Coluna pra trackear contador (auditavel)
ALTER TABLE public.webinar_campaign_leads
    ADD COLUMN IF NOT EXISTS consecutive_agent_replies INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS auto_paused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS auto_pause_reason TEXT;

COMMENT ON COLUMN public.webinar_campaign_leads.consecutive_agent_replies IS
    'Contagem de outbounds consecutivos do agente sem inbound humano real. Reseta quando lead manda mensagem com texto real.';

COMMENT ON COLUMN public.webinar_campaign_leads.auto_paused_at IS
    'Quando o lead foi pausado automaticamente por detecção de loop.';

-- Função de detecção de loop (mesma lógica do TypeScript, em SQL).
-- Pode ser chamada por trigger OU manualmente.
CREATE OR REPLACE FUNCTION public.webinar_check_loop(p_lead_id UUID)
RETURNS TABLE (in_loop BOOLEAN, outbound_count INT, reason TEXT) AS $$
DECLARE
    v_outbound_count INT;
    v_human_inbound_count INT;
BEGIN
    -- Conta outbounds 'agent_reply' enviados nos ultimos 5min
    SELECT COUNT(*) INTO v_outbound_count
    FROM public.webinar_messages
    WHERE campaign_lead_id = p_lead_id
      AND direction = 'outbound'
      AND status IN ('sent','delivered','read')
      AND category = 'agent_reply'
      AND sent_at >= NOW() - INTERVAL '5 minutes';

    -- Conta inbounds com texto humano real nos ultimos 5min
    -- (texto > 10 chars, sem padroes obvios de auto-reply)
    SELECT COUNT(*) INTO v_human_inbound_count
    FROM public.webinar_messages
    WHERE campaign_lead_id = p_lead_id
      AND direction = 'inbound'
      AND sent_at >= NOW() - INTERVAL '5 minutes'
      AND LENGTH(TRIM(COALESCE(sent_text, ''))) > 10
      AND sent_text !~* '(?:digite|escolha|selecione|op[cç][aã]o|n[uú]mero|menu|aten[cç][aã]o|fora do hor[aá]rio|autoatendimento|bem.?vindo).{0,40}(?:digite|escolha|selecione|op[cç][aã]o)'
      AND sent_text !~* '\*\s*[1-9]\s*\*\s*[-–]'
      AND sent_text !~* 'n[aã]o\s+entendemos';

    IF v_outbound_count >= 3 AND v_human_inbound_count = 0 THEN
        in_loop := TRUE;
        outbound_count := v_outbound_count;
        reason := v_outbound_count || ' outbound em 5min sem inbound humano real';
    ELSE
        in_loop := FALSE;
        outbound_count := v_outbound_count;
        reason := NULL;
    END IF;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.webinar_check_loop IS
    'Detecta loop de auto-reply num lead. Retorna in_loop=TRUE se >=3 outbound em 5min sem inbound humano.';

-- Função de auto-pause: chama webinar_check_loop e pausa se necessário.
-- Executada por trigger AFTER INSERT em webinar_messages outbound.
CREATE OR REPLACE FUNCTION public.webinar_trigger_loop_guard()
RETURNS TRIGGER AS $$
DECLARE
    v_check RECORD;
BEGIN
    -- Só checa pra outbound agent_reply enviado
    IF NEW.direction = 'outbound'
       AND NEW.status IN ('sent','delivered','read')
       AND NEW.category = 'agent_reply' THEN

        SELECT * INTO v_check FROM public.webinar_check_loop(NEW.campaign_lead_id);
        IF v_check.in_loop THEN
            UPDATE public.webinar_campaign_leads
            SET ai_paused = TRUE,
                auto_paused_at = NOW(),
                auto_pause_reason = 'loop_guard: ' || v_check.reason,
                consecutive_agent_replies = v_check.outbound_count
            WHERE id = NEW.campaign_lead_id
              AND ai_paused = FALSE;  -- só atualiza se ainda nao pausado
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS webinar_loop_guard_trigger ON public.webinar_messages;
CREATE TRIGGER webinar_loop_guard_trigger
AFTER INSERT ON public.webinar_messages
FOR EACH ROW
EXECUTE FUNCTION public.webinar_trigger_loop_guard();

COMMENT ON TRIGGER webinar_loop_guard_trigger ON public.webinar_messages IS
    'Defesa em profundidade: após cada agent_reply enviado, verifica padrão de loop e pausa lead se confirmado.';

-- View pra observabilidade: leads pausados por loop
CREATE OR REPLACE VIEW public.webinar_leads_auto_paused AS
SELECT
    l.id,
    l.company_name,
    l.phone,
    l.last_instance_used,
    l.auto_paused_at,
    l.auto_pause_reason,
    l.consecutive_agent_replies,
    c.name AS campaign_name,
    (
      SELECT COUNT(*) FROM public.webinar_messages m
      WHERE m.campaign_lead_id = l.id
        AND m.direction = 'outbound'
        AND m.status IN ('sent','delivered','read')
        AND m.category = 'agent_reply'
        AND m.sent_at >= l.auto_paused_at - INTERVAL '10 minutes'
    ) AS msgs_no_loop
FROM public.webinar_campaign_leads l
JOIN public.webinar_campaigns c ON c.id = l.campaign_id
WHERE l.auto_paused_at IS NOT NULL
ORDER BY l.auto_paused_at DESC;

COMMENT ON VIEW public.webinar_leads_auto_paused IS
    'Leads pausados automaticamente pelo loop_guard. Pra revisar quais clientes precisam de atendimento humano.';
