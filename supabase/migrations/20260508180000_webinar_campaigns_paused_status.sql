-- ============================================================
-- WEBINAR CAMPAIGNS — adiciona "paused" ao check constraint do status
-- ============================================================
-- Bug observado: ao tentar pausar campanha (status="paused"), a UI
-- retornou erro "violates check constraint webinar_campaigns_status_check"
-- porque o enum no banco não incluía "paused".
--
-- Fix: dropa constraint antiga e recria com "paused" incluído.
-- ============================================================

ALTER TABLE public.webinar_campaigns
    DROP CONSTRAINT IF EXISTS webinar_campaigns_status_check;

ALTER TABLE public.webinar_campaigns
    ADD CONSTRAINT webinar_campaigns_status_check
    CHECK (status IN (
        'draft',
        'scraping',
        'enriching',
        'ready',
        'active',
        'paused',
        'finished',
        'archived'
    ));

COMMENT ON CONSTRAINT webinar_campaigns_status_check ON public.webinar_campaigns IS
    'Status válidos da campanha. "paused" foi adicionado em 2026-05-08 pra suportar pausar/retomar.';
