-- Serie diaria para o BI da Inteligencia (fuso America/Sao_Paulo):
-- leads novos (1o contato + classificacao NEW_LEAD), agendamentos (data REAL
-- da confirmacao), atendimentos (conversas respondidas pela clinica no dia)
-- e conversas ativas (qualquer mensagem no dia).
CREATE OR REPLACE FUNCTION public.ai_daily_stats(p_tenant uuid, p_days int DEFAULT 14)
RETURNS TABLE(dia date, leads_novos int, agendamentos int, atendimentos int, conversas int)
LANGUAGE sql SECURITY DEFINER AS $$
WITH dias AS (
  SELECT generate_series(
    (now() AT TIME ZONE 'America/Sao_Paulo')::date - (p_days - 1),
    (now() AT TIME ZONE 'America/Sao_Paulo')::date, '1 day')::date AS d
),
leads AS (
  SELECT (first_contact_at AT TIME ZONE 'America/Sao_Paulo')::date d, count(*) n
  FROM deal_ai_state WHERE tenant_id = p_tenant AND contact_classification = 'NEW_LEAD'
  GROUP BY 1
),
ags AS (
  SELECT (appointment_confirmed_at AT TIME ZONE 'America/Sao_Paulo')::date d, count(*) n
  FROM deal_ai_state WHERE tenant_id = p_tenant AND appointment_confirmed_at IS NOT NULL
  GROUP BY 1
),
atend AS (
  SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date d, count(DISTINCT m.deal_id) n
  FROM messages m WHERE m.tenant_id = p_tenant AND m.direction = 'outbound'
  GROUP BY 1
),
convs AS (
  SELECT (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date d, count(DISTINCT m.deal_id) n
  FROM messages m WHERE m.tenant_id = p_tenant
  GROUP BY 1
)
SELECT dias.d, coalesce(l.n,0)::int, coalesce(a.n,0)::int, coalesce(t.n,0)::int, coalesce(c.n,0)::int
FROM dias
LEFT JOIN leads l ON l.d = dias.d
LEFT JOIN ags a ON a.d = dias.d
LEFT JOIN atend t ON t.d = dias.d
LEFT JOIN convs c ON c.d = dias.d
ORDER BY dias.d
$$;
