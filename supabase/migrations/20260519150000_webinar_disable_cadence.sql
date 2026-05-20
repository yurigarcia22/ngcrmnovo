-- ============================================================
-- WEBINAR — Toggle de cadência automática por campanha
-- ============================================================
-- Cadência (reminder/nutricao/post_event) tem tido bugs recorrentes
-- (timezone, alucinações, rajadas). User pediu pra desativar tudo
-- e fazer manualmente. Esta migration:
--   1. Adiciona flag cadence_enabled (default FALSE — desativada)
--   2. Cancela todos reminders pending das campanhas atuais
-- ============================================================

ALTER TABLE public.webinar_campaigns
    ADD COLUMN IF NOT EXISTS cadence_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.webinar_campaigns.cadence_enabled IS
    'Se TRUE, ao confirmar lead o sistema agenda cadência de lembretes (D-1, T-1h, T-10min, nutrição). Default FALSE — controle manual pelo time.';

-- Marca campanhas existentes como cadence_enabled=FALSE (redundante mas explicito)
UPDATE public.webinar_campaigns SET cadence_enabled = FALSE;

-- Cancela TODOS reminders/nutricao/post_event pending pra zerar estado
UPDATE public.webinar_messages
SET status = 'cancelled',
    error_message = 'cadencia desativada manualmente (migration 20260519150000)'
WHERE status = 'pending'
  AND category IN ('reminder','nutricao','post_event');
