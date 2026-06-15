-- Respostas rapidas com imagem/arquivo: guarda a midia (no Storage crm-media)
-- e o tipo. Ao usar a resposta no chat, envia a midia com o texto como legenda.
ALTER TABLE public.quick_replies
    ADD COLUMN IF NOT EXISTS media_url  text,
    ADD COLUMN IF NOT EXISTS media_type text;
