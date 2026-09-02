-- Sync inicial do PILOTO: quando o modo e ativado, aplica o mapeamento ao
-- estado ATUAL de todos os deals abertos (mesmos guard-rails do motor:
-- confianca >= limiar, nunca ganho/perda, nunca regressao). Sem isso o
-- piloto so agiria em MUDANCAS futuras de estado e o usuario ligava o modo
-- e "nada acontecia".
CREATE OR REPLACE FUNCTION public.ai_pilot_sync(p_tenant uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE r record; n int := 0; v_minconf numeric;
BEGIN
  SELECT min_confidence_move INTO v_minconf FROM ai_settings WHERE tenant_id = p_tenant;
  FOR r IN
    SELECT d.id deal_id, d.stage_id cur, m.stage_id target, st.confidence, s_t.is_inbox
    FROM deals d
    JOIN deal_ai_state st ON st.deal_id = d.id
    JOIN stages s_cur ON s_cur.id = d.stage_id
    JOIN ai_stage_mapping m ON m.tenant_id = d.tenant_id
      AND m.pipeline_id = s_cur.pipeline_id AND m.ai_stage = st.funnel_stage
    JOIN stages s_t ON s_t.id = m.stage_id
    WHERE d.tenant_id = p_tenant AND d.status = 'open'
      AND coalesce(st.confidence, 0) >= coalesce(v_minconf, 0.85)
      AND s_t.id <> d.stage_id AND NOT s_t.is_won AND NOT s_t.is_lost
      AND s_t.position > s_cur.position
  LOOP
    UPDATE deals SET stage_id = r.target, stage_entered_at = now(), updated_at = now(),
      promoted_at = coalesce(promoted_at, CASE WHEN NOT r.is_inbox THEN now() END)
    WHERE id = r.deal_id AND status = 'open';
    INSERT INTO crm_events (tenant_id, deal_id, source, event_type, previous_value, new_value, confidence)
    VALUES (p_tenant, r.deal_id, 'ai', 'stage_moved_by_ai', r.cur::text, r.target::text, r.confidence);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
