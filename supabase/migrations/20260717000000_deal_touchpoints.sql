-- Cadencia no funil de vendas: contador de pontos de contato por deal
-- (mesmo conceito de "tentativas" do cold-call). Incrementado pelo botao
-- no card; cada registro tambem vira nota no historico do deal.
ALTER TABLE public.deals
    ADD COLUMN IF NOT EXISTS touchpoints integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_touch_at timestamptz;
