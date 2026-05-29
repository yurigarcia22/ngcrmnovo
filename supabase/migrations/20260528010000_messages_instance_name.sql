-- Rastreia por qual instancia/numero do WhatsApp cada mensagem passou.
-- Usado na janela de conversa para mostrar com qual numero o lead falava e
-- avisar quando o numero que vai responder diverge.
-- Populado em: app/actions.ts sendMessage (outbound) e
-- supabase/functions/webhook-evolution (inbound).
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS instance_name text;
