-- =====================================================================
-- Caixa-preta do webhook do WhatsApp: TODO evento que chega e registrado
-- aqui ANTES de qualquer processamento. Se o processamento falhar, o evento
-- fica com status 'error' e um cron reprocessa — mensagem nunca se perde
-- silenciosamente.
--   status: received  -> chegou, processamento em andamento
--           processed -> virou mensagem/status no CRM
--           ignored   -> descartado de proposito (grupo, reacao, duplicata...)
--           error     -> falhou; cron de retry vai reprocessar
--           orphan    -> instancia desconhecida (recuperavel apos corrigir config)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    instance_name         text,
    tenant_id             uuid,
    event_type            text,
    evolution_message_id  text,
    payload               jsonb NOT NULL,
    status                text NOT NULL DEFAULT 'received',
    detail                text,
    attempts              integer NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now(),
    processed_at          timestamptz
);

-- Fila de retry: so os pendentes/errados sao varridos.
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
    ON public.webhook_events(created_at)
    WHERE status IN ('error', 'received');
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON public.webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_msgid ON public.webhook_events(evolution_message_id) WHERE evolution_message_id IS NOT NULL;

-- Sem policies: apenas service role acessa (RLS ligado bloqueia anon/user).
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
