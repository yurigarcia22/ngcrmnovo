-- Data do PRIMEIRO CONTATO real do cliente (min das mensagens do deal).
-- deals.created_at nao serve para conversas vindas de sincronizacao de
-- historico (o deal nasce no sync, nao no primeiro contato).
ALTER TABLE public.deal_ai_state ADD COLUMN IF NOT EXISTS first_contact_at timestamptz;

-- Backfill dos estados ja analisados
UPDATE public.deal_ai_state st
SET first_contact_at = m.first_msg
FROM (
  SELECT deal_id, min(created_at) AS first_msg FROM public.messages GROUP BY deal_id
) m
WHERE m.deal_id = st.deal_id AND st.first_contact_at IS NULL;
