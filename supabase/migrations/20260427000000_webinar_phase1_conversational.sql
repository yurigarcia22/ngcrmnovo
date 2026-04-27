-- ============================================================
-- WEBINAR — Fase 1 conversacional + dados do responsável
-- ============================================================
-- Adiciona:
-- 1. Campos pra coletar dados do responsável (nome + contato)
-- 2. Status novos: pending_response, qualifying, pitched, collecting_info
-- 3. Categoria nas mensagens pra cron diferenciar timing (initial_outreach vs reminder)
-- ============================================================

-- 1. Dados do responsável
ALTER TABLE public.webinar_campaign_leads
    ADD COLUMN IF NOT EXISTS responsible_name text,
    ADD COLUMN IF NOT EXISTS responsible_email text,
    ADD COLUMN IF NOT EXISTS responsible_direct_phone text;

COMMENT ON COLUMN public.webinar_campaign_leads.responsible_name IS 'Nome completo do responsável da empresa, coletado pelo agente IA na conversa.';
COMMENT ON COLUMN public.webinar_campaign_leads.responsible_email IS 'Email direto do responsável.';
COMMENT ON COLUMN public.webinar_campaign_leads.responsible_direct_phone IS 'Telefone direto do responsável (pode ser diferente do phone do registro inicial).';

-- 2. Status novos pra fluxo conversacional
ALTER TABLE public.webinar_campaign_leads
    DROP CONSTRAINT IF EXISTS webinar_campaign_leads_funnel_status_check;

ALTER TABLE public.webinar_campaign_leads
    ADD CONSTRAINT webinar_campaign_leads_funnel_status_check
    CHECK (funnel_status IN (
        'scraped', 'enriched', 'invited',
        'pending_response', 'qualifying', 'pitched', 'collecting_info',
        'pending_optin', 'opted_in',
        'viewed', 'replied', 'confirmed', 'attended', 'no_show',
        'converted', 'interested_future', 'escalated', 'lost'
    ));

COMMENT ON COLUMN public.webinar_campaign_leads.funnel_status IS
    'Funil Fase 1 conversacional:
     scraped/enriched -> raw, ainda nao convidado
     pending_response -> mandou saudacao inicial (Bom dia, tudo bem?)
     qualifying -> em conversa, agente perguntando se eh responsavel
     pitched -> recebeu pitch do evento
     collecting_info -> agente pediu nome + email/tel
     confirmed -> dados coletados, cadencia de lembretes agendada
     attended -> esteve presente
     converted -> agendou diagnostico
     interested_future -> nao pode neste, mas mostrou interesse
     escalated -> precisa humano
     lost -> recusou ou ignorou';

-- 3. Categoria de mensagem (pra cron diferenciar timing)
ALTER TABLE public.webinar_messages
    ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.webinar_messages.category IS
    'Categoria da mensagem:
     initial_outreach -> primeira saudacao (cold), tem timer maior 3-7min
     reminder -> lembrete D-1/1h/10min, scheduled_at fixo
     nutricao -> conteudo de valor entre confirmacao e evento
     post_event -> mensagem pos-evento (D+1)
     agent_reply -> resposta do agente Gemini (timer curto)';

CREATE INDEX IF NOT EXISTS idx_wm_category ON public.webinar_messages (category);
