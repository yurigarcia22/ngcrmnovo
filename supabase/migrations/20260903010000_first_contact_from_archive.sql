-- O 1o contato REAL pode estar so no arquivo de historico (conversa que
-- "renasceu" depois do corte). A reidratacao horaria tambem corrige a data
-- pelo arquivo, mesmo quando nao ha mensagens novas a religar.
CREATE OR REPLACE FUNCTION public.rehydrate_first_contact(p_tenant uuid)
RETURNS int LANGUAGE sql SECURITY DEFINER AS $$
  WITH arq AS (
    SELECT ident, is_lid, min(ts) primeiro
    FROM hist_archive WHERE tenant_id = p_tenant GROUP BY 1, 2
  ), upd AS (
    UPDATE deal_ai_state st
    SET first_contact_at = a.primeiro
    FROM deals d
    JOIN contacts c ON c.id = d.contact_id
    JOIN arq a ON (a.is_lid AND c.wa_lid = a.ident)
               OR (NOT a.is_lid AND c.phone = a.ident)
               OR (NOT a.is_lid AND length(a.ident) = 13 AND substring(a.ident,5,1) = '9'
                   AND c.phone = substring(a.ident,1,4) || substring(a.ident,6))
    WHERE st.deal_id = d.id AND d.tenant_id = p_tenant
      AND a.primeiro < st.first_contact_at
    RETURNING 1
  ) SELECT count(*)::int FROM upd
$$;
