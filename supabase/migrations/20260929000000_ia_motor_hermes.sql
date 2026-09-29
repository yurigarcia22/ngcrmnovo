-- Motor da IA por cliente: 'gpt' (o de hoje, a cada 2 min) ou 'hermes'
-- (agente local com Opus, de hora em hora, pela API de lote do ai-analyze).
--
-- O GPT vira reserva automatica: se o Hermes passar 2h sem aparecer no horario
-- comercial (PC desligado, hibernando, cota acabou), os clientes em 'hermes'
-- voltam a ser analisados pelo GPT ate o Hermes voltar.
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS motor text NOT NULL DEFAULT 'gpt';
DO $$ BEGIN
  ALTER TABLE public.ai_settings ADD CONSTRAINT ai_settings_motor_chk CHECK (motor IN ('gpt', 'hermes'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cada chamada do Hermes fica registrada: serve de sinal de vida e de medidor
-- de tokens da assinatura.
CREATE TABLE IF NOT EXISTS public.ai_lote_rodadas (
  id bigserial PRIMARY KEY,
  criada_em timestamptz NOT NULL DEFAULT now(),
  tipo text NOT NULL,                 -- 'pendentes' | 'resultado'
  qtd int NOT NULL DEFAULT 0,
  gravados int,
  erros int,
  modelo text,
  tokens_entrada int,
  tokens_saida int,
  detalhe jsonb
);
CREATE INDEX IF NOT EXISTS idx_ai_lote_rodadas_criada ON public.ai_lote_rodadas (criada_em DESC);
ALTER TABLE public.ai_lote_rodadas ENABLE ROW LEVEL SECURITY;

-- Reserva de card: o que o Hermes pegou para analisar fica 20 min fora do GPT
-- (evita os dois analisarem a mesma conversa) e so o Hermes pode devolver
-- resultado para card que ele mesmo reservou.
CREATE TABLE IF NOT EXISTS public.ai_lote_reserva (
  deal_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  ultima_msg timestamptz NOT NULL,
  ate timestamptz NOT NULL
);
ALTER TABLE public.ai_lote_reserva ENABLE ROW LEVEL SECURITY;

-- Hermes parado = horario comercial (8h-21h59 de Brasilia) e sem sinal ha 2h.
-- De madrugada o GPT nao assume: a rodada das 7h do Hermes pega o que ficou.
CREATE OR REPLACE FUNCTION public.ai_hermes_parado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT extract(hour FROM now() AT TIME ZONE 'America/Sao_Paulo') BETWEEN 8 AND 21
     AND coalesce((SELECT max(criada_em) FROM ai_lote_rodadas), '-infinity'::timestamptz) < now() - interval '2 hours'
$$;

-- Fila do GPT: igual a de antes, mas cliente em 'hermes' so entra se o Hermes
-- estiver parado, e card reservado pelo Hermes fica de fora.
CREATE OR REPLACE FUNCTION public.ai_pick_deals(p_limit integer DEFAULT 12)
RETURNS TABLE(deal_id uuid, tenant_id uuid, last_msg_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.tenant_id, mx.last_msg
  FROM deals d
  JOIN ai_settings s ON s.tenant_id = d.tenant_id AND s.enabled
  JOIN LATERAL (
    SELECT max(m.created_at) AS last_msg FROM messages m WHERE m.deal_id = d.id
  ) mx ON true
  LEFT JOIN deal_ai_state st ON st.deal_id = d.id
  WHERE d.status = 'open'
    AND mx.last_msg IS NOT NULL
    AND mx.last_msg > COALESCE(st.last_analyzed_message_at, '-infinity'::timestamptz)
    AND (s.analyze_from IS NULL OR mx.last_msg >= s.analyze_from)
    AND mx.last_msg < now() - interval '90 seconds'
    AND (s.motor = 'gpt' OR ai_hermes_parado())
    AND NOT EXISTS (SELECT 1 FROM ai_lote_reserva r WHERE r.deal_id = d.id AND r.ate > now())
  ORDER BY mx.last_msg ASC
  LIMIT p_limit
$$;

-- Fila do Hermes: mesmos criterios, so clientes em 'hermes', e ja reserva o que
-- entregou. Trava curta para duas chamadas simultaneas nao pegarem o mesmo card.
CREATE OR REPLACE FUNCTION public.ai_pick_deals_lote(p_limit integer DEFAULT 10)
RETURNS TABLE(deal_id uuid, tenant_id uuid, last_msg_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ai_pick_deals_lote'));
  DELETE FROM ai_lote_reserva WHERE ate <= now();
  RETURN QUERY
  WITH escolhidos AS (
    SELECT d.id, d.tenant_id, mx.last_msg
    FROM deals d
    JOIN ai_settings s ON s.tenant_id = d.tenant_id AND s.enabled AND s.motor = 'hermes'
    JOIN LATERAL (
      SELECT max(m.created_at) AS last_msg FROM messages m WHERE m.deal_id = d.id
    ) mx ON true
    LEFT JOIN deal_ai_state st ON st.deal_id = d.id
    WHERE d.status = 'open'
      AND mx.last_msg IS NOT NULL
      AND mx.last_msg > COALESCE(st.last_analyzed_message_at, '-infinity'::timestamptz)
      AND (s.analyze_from IS NULL OR mx.last_msg >= s.analyze_from)
      AND mx.last_msg < now() - interval '90 seconds'
      AND NOT EXISTS (SELECT 1 FROM ai_lote_reserva r WHERE r.deal_id = d.id)
    ORDER BY mx.last_msg ASC
    LIMIT greatest(1, least(p_limit, 30))
  ), reserva AS (
    INSERT INTO ai_lote_reserva (deal_id, tenant_id, ultima_msg, ate)
    SELECT e.id, e.tenant_id, e.last_msg, now() + interval '20 minutes' FROM escolhidos e
    ON CONFLICT ON CONSTRAINT ai_lote_reserva_pkey DO NOTHING
    RETURNING ai_lote_reserva.deal_id
  )
  SELECT e.id, e.tenant_id, e.last_msg FROM escolhidos e
  WHERE e.id IN (SELECT r.deal_id FROM reserva r);
END $$;

REVOKE ALL ON FUNCTION public.ai_pick_deals_lote(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_pick_deals_lote(integer) TO service_role;
REVOKE ALL ON FUNCTION public.ai_hermes_parado() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_hermes_parado() TO service_role;
