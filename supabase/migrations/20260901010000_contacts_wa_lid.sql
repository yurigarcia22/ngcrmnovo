-- Suporte a LID (WhatsApp "linked id"): identificador que a Meta usa no lugar
-- do telefone. Na sincronizacao de historico ~65% das conversas chegam so com
-- LID, sem telefone. Antes o LID ia parar no campo `phone`, criando contatos
-- com "telefone" invalido (impossivel ligar, abrir wa.me ou casar com o numero
-- real quando a pessoa mandasse mensagem depois).
--
-- Agora o LID tem campo proprio: o contato existe, a conversa e recebida e pode
-- ser respondida (a Evolution endereca <lid>@lid), e quando o telefone real
-- aparecer o contato e completado em vez de duplicado.

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS wa_lid text;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_walid_key
    ON public.contacts (tenant_id, wa_lid)
    WHERE wa_lid IS NOT NULL;

COMMENT ON COLUMN public.contacts.wa_lid IS
    'WhatsApp LID (sem @lid). Preenchido quando a conversa chega sem telefone. Pode coexistir com phone apos o merge.';
