-- IA Inteligencia — Fases 3 (piloto) e 4 (alertas + resumo diario)
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS alerts_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS daily_digest boolean NOT NULL DEFAULT true;
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS hot_intent_threshold int NOT NULL DEFAULT 80;

COMMENT ON COLUMN public.ai_settings.hot_intent_threshold IS
    'Score minimo de intencao para alerta de lead quente aguardando a clinica';
