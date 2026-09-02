-- O unique parcial (WHERE phone IS NOT NULL) quebrou o upsert do n8n:
-- PostgREST on_conflict=tenant_id,phone gera ON CONFLICT (tenant_id, phone)
-- SEM clausula WHERE, que nao casa com indice parcial (42P10). Constraint
-- UNIQUE total resolve e continua permitindo multiplos phone NULL
-- (NULL <> NULL em unique) — o parcial era desnecessario.
DROP INDEX IF EXISTS contacts_tenant_phone_key;
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_tenant_phone_key;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_tenant_phone_key UNIQUE (tenant_id, phone);
