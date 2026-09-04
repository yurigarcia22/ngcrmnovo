-- DATA REAL do agendamento detectado: o card contava o agendamento no dia em
-- que a IA processou (re-analise puxava para hoje), nao no dia em que o
-- paciente confirmou na conversa. Guardamos o timestamp da ULTIMA MENSAGEM do
-- lote em que confirmed virou true — o melhor proxy do momento da confirmacao.
ALTER TABLE public.deal_ai_state ADD COLUMN IF NOT EXISTS appointment_confirmed_at timestamptz;
