-- ============================================================
-- WEBINAR — loop_guard: aceitar respostas curtas legítimas
-- ============================================================
-- Bug: webinar_check_loop exigia LENGTH > 10 pra considerar "inbound
-- humano real". Mas "Sim", "Pode sim", "ok", "oi" são respostas reais
-- de pessoa. Resultado: lead respondia "Pode sim" confirmando o evento,
-- guard via como "sem inbound humano" e pausava o lead.
--
-- Fix: aceitar texto >= 2 chars, MAS expandir a lista de padroes de
-- auto-reply pra excluir templates classicos. Mesmos patterns que o
-- looksLikeAutoReply do JS usa.
-- ============================================================

CREATE OR REPLACE FUNCTION public.webinar_check_loop(p_lead_id UUID)
RETURNS TABLE (in_loop BOOLEAN, outbound_count INT, reason TEXT) AS $$
DECLARE
    v_outbound_count INT;
    v_human_inbound_count INT;
BEGIN
    SELECT COUNT(*) INTO v_outbound_count
    FROM public.webinar_messages
    WHERE campaign_lead_id = p_lead_id
      AND direction = 'outbound'
      AND status IN ('sent','delivered','read')
      AND category = 'agent_reply'
      AND sent_at >= NOW() - INTERVAL '5 minutes';

    -- Conta inbounds com texto humano real nos últimos 5min
    -- Critério: >=2 chars E não bate em nenhum pattern de auto-reply
    SELECT COUNT(*) INTO v_human_inbound_count
    FROM public.webinar_messages
    WHERE campaign_lead_id = p_lead_id
      AND direction = 'inbound'
      AND sent_at >= NOW() - INTERVAL '5 minutes'
      AND LENGTH(TRIM(COALESCE(sent_text, ''))) >= 2
      -- Menus numerados de WhatsApp Business
      AND sent_text !~* '\*\s*[1-9]\s*\*\s*[-–]'
      AND sent_text !~* '(?:digite|escolha|selecione)\s+(?:o|a|um|uma|n[uú]mero|op[cç][aã]o)'
      -- Auto-replies clássicos
      AND sent_text !~* 'agradece(?:mos|u)?\s+(?:o\s+)?(?:seu\s+)?(?:contato|mensagem)'
      AND sent_text !~* 'em\s+breve\s+(?:retorn|respond|atend)'
      AND sent_text !~* 'horário\s+de\s+atendimento'
      AND sent_text !~* 'fora\s+(?:do\s+)?(?:horário|expediente)'
      AND sent_text !~* 'seja\s+bem.?vind'
      AND sent_text !~* 'obrigad[ao]\s+(?:pelo|por)\s+(?:entrar|contato)'
      AND sent_text !~* 'wa\.me/\d{10,}'
      AND sent_text !~* 'plant[aã]o[:\s]*\d'
      AND sent_text !~* 'para\s+iniciar\s+(?:o|seu)\s+atendimento'
      AND sent_text !~* 'este\s+(?:é\s+o\s+)?(?:whatsapp|n[uú]mero|canal)\s+(?:é|para|de|do)'
      AND sent_text !~* 'resposta\s+esperada\s+deve\s+conter'
      AND sent_text !~* 'n[aã]o\s+entendemos\s+(?:sua|a)\s+mensag'
      AND sent_text !~* 'autoatendimento|menu\s+(?:principal|de\s+op)';

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
