-- Classificacao da IA no estado corrente (NEW_LEAD | EXISTING_PATIENT |
-- NON_COMMERCIAL): o filtro "Leads novos" da pagina Inteligencia usa isto
-- alem da data de 1o contato — paciente pedindo continuidade de tratamento
-- ("finalizar o canal") nao conta como lead novo.
ALTER TABLE public.deal_ai_state ADD COLUMN IF NOT EXISTS contact_classification text;
