-- A conversa ia para o modelo com horario em UTC: mensagem das 15h de Brasilia
-- aparecia como 18h, e o modelo errava "hoje", "amanha" e "as 16h". Agora cada
-- clinica tem o seu fuso e os rotulos saem no horario local.
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

-- Vitta Pata fica em Cuiaba (uma hora a menos que Brasilia)
UPDATE public.ai_settings SET timezone = 'America/Cuiaba'
 WHERE tenant_id = '2af6c8f8-d008-4f1c-bd5e-ba09bda9276e';
