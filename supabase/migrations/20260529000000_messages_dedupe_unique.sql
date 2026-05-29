-- Corrige mensagens duplicadas: a Evolution as vezes reenvia o mesmo evento
-- (retry), e o webhook nao tinha protecao de idempotencia.

-- 1. Remove duplicatas existentes (mesmo evolution_message_id no mesmo tenant),
--    mantendo a linha mais antiga.
DELETE FROM public.messages a
USING public.messages b
WHERE a.evolution_message_id IS NOT NULL
  AND a.evolution_message_id = b.evolution_message_id
  AND a.tenant_id = b.tenant_id
  AND (a.created_at > b.created_at
       OR (a.created_at = b.created_at AND a.id > b.id));

-- 2. Indice unico parcial: impede inserir a mesma mensagem do WhatsApp duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS messages_tenant_evolution_msg_uniq
  ON public.messages (tenant_id, evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;
