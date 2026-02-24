-- Drop the old constraint
ALTER TABLE cold_leads DROP CONSTRAINT IF EXISTS cold_leads_status_check;

-- Add the new constraint including 'numero_inexistente'
ALTER TABLE cold_leads ADD CONSTRAINT cold_leads_status_check
  CHECK (status IN ('novo_lead', 'lead_qualificado', 'ligacao_feita', 'contato_realizado', 'contato_decisor', 'reuniao_marcada', 'numero_inexistente'));
