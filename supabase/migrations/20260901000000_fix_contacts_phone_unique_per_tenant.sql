-- BUG CRITICO MULTI-TENANT: contacts.phone era UNIQUE GLOBAL.
--
-- Sintoma: mensagem de um numero que JA existe como contato em OUTRO tenant
-- falhava ao criar o contato ("duplicate key contacts_phone_key") e a mensagem
-- era descartada silenciosamente. Descoberto no tenant "Dr. Yasmin": mensagens
-- do numero 553799577862 nunca chegavam porque o mesmo numero ja era contato
-- do tenant GRUPO NG.
--
-- Correcao: o telefone deve ser unico DENTRO de cada tenant, nunca entre tenants.
-- Clientes diferentes podem (e vao) falar com as mesmas pessoas.

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_phone_key
    ON public.contacts (tenant_id, phone)
    WHERE phone IS NOT NULL;
