-- Guarda a transcricao (texto) de mensagens de audio do WhatsApp.
-- Gerada sob demanda via OpenAI Whisper (app/actions.ts transcribeMessageAudio).
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS transcription text;
