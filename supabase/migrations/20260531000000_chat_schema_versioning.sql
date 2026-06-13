-- Versionamento idempotente do schema do CHAT que ate entao vivia so no
-- dashboard (criado a mao). Garante que um tenant/ambiente novo provisionado
-- pelas migrations tenha tudo que o chat precisa. Tudo IF NOT EXISTS / guards,
-- entao roda sem efeito na producao atual (que ja tem essas estruturas).

-- 1. Colunas de organizacao da caixa de entrada (Adiar / Resolver).
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
    ADD COLUMN IF NOT EXISTS resolved_at  timestamptz;

-- Indices parciais usados nos filtros da lista de conversas e dashboard.
CREATE INDEX IF NOT EXISTS deals_snoozed_until_idx
    ON public.deals (tenant_id, snoozed_until)
    WHERE snoozed_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS deals_resolved_at_idx
    ON public.deals (tenant_id, resolved_at)
    WHERE resolved_at IS NOT NULL;

-- 2. Publicacao de realtime para messages e deals (o chat em tempo real e o
--    badge de nao-lidas dependem disso). Idempotente via checagem.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'deals'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
    END IF;
END $$;

-- REPLICA IDENTITY FULL em deals: o kanban de leads escuta UPDATE com evento '*'
-- e precisa do payload completo. (messages so usa INSERT/UPDATE por PK -> default basta.)
ALTER TABLE public.deals REPLICA IDENTITY FULL;
