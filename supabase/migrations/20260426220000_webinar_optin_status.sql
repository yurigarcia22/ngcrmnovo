-- ============================================================
-- WEBINAR — Opt-in flow + nurture cadence
-- ============================================================
-- Adiciona status pending_optin e opted_in pro fluxo correto:
-- 1. Lead recebe CONVITE (status pending_optin)
-- 2. Lead aceita -> status opted_in -> dispara nutricao + lembretes
-- 3. Lead recusa -> status lost
-- 4. Lead nao responde em 48h -> reforco unico
-- ============================================================

ALTER TABLE public.webinar_campaign_leads
    DROP CONSTRAINT IF EXISTS webinar_campaign_leads_funnel_status_check;

ALTER TABLE public.webinar_campaign_leads
    ADD CONSTRAINT webinar_campaign_leads_funnel_status_check
    CHECK (funnel_status IN (
        'scraped', 'enriched', 'invited', 'pending_optin', 'opted_in',
        'viewed', 'replied', 'confirmed', 'attended', 'no_show',
        'converted', 'interested_future', 'escalated', 'lost'
    ));

COMMENT ON COLUMN public.webinar_campaign_leads.funnel_status IS
    'Funil:
     scraped/enriched -> raw, ainda nao convidado
     invited -> convite enviado, sem resposta
     pending_optin -> convite enviado, aguardando aceitar
     opted_in -> aceitou, recebe nutricao + lembretes
     replied -> respondeu mas ainda nao confirmou
     confirmed -> confirmou presenca
     attended -> esteve presente
     converted -> agendou diagnostico
     interested_future -> nao pode neste, mas mostrou interesse
     escalated -> precisa humano
     lost -> recusou ou ignorou';