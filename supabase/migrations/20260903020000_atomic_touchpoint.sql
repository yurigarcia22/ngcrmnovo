-- Cadencia ATOMICA: o incremento era read-modify-write na action (dois
-- cliques rapidos liam o mesmo valor e um incremento se perdia). Agora o
-- banco soma/subtrai atomicamente e devolve o valor final.
CREATE OR REPLACE FUNCTION public.deal_touch(p_deal uuid, p_tenant uuid, p_delta int)
RETURNS TABLE (touchpoints int, last_touch_at timestamptz)
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE deals d SET
    touchpoints = greatest(0, coalesce(d.touchpoints, 0) + p_delta),
    last_touch_at = CASE
      WHEN p_delta > 0 THEN now()
      WHEN greatest(0, coalesce(d.touchpoints, 0) + p_delta) = 0 THEN NULL
      ELSE d.last_touch_at END,
    updated_at = now()
  WHERE d.id = p_deal AND d.tenant_id = p_tenant
  RETURNING d.touchpoints, d.last_touch_at
$$;
