-- ARQUIVO DE HISTORICO (reidratacao)
-- O corte de 01/09 tira conversas mortas do funil, mas quem responde depois
-- "renasce" sem passado. Este arquivo guarda o historico dos lotes do sync
-- (messages.set da caixa-preta) de forma consultavel; um job religa o
-- passado ao deal novo automaticamente (mesmo telefone/LID).
CREATE TABLE IF NOT EXISTS public.hist_archive (
  wamid text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  ident text NOT NULL,           -- telefone canonico (com 9) ou LID
  is_lid boolean NOT NULL,
  from_me boolean NOT NULL,
  ts timestamptz NOT NULL,
  mtype text,
  body text,
  push_name text
);
CREATE INDEX IF NOT EXISTS idx_hist_archive_ident ON public.hist_archive (tenant_id, ident);
ALTER TABLE public.hist_archive ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Multitenant Isolation" ON public.hist_archive USING (tenant_id = get_my_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Religa historico do arquivo aos deals ATIVOS (mesmo ident, wamid inedito)
CREATE OR REPLACE FUNCTION public.rehydrate_from_archive(p_tenant uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE n int;
BEGIN
  WITH alvo AS (
    SELECT d.id deal_id, d.contact_id, coalesce(c.wa_lid, c.phone) ident_lid, c.phone, c.wa_lid
    FROM deals d JOIN contacts c ON c.id = d.contact_id
    WHERE d.tenant_id = p_tenant AND d.status = 'open'
  ),
  ins AS (
    INSERT INTO messages (tenant_id, deal_id, contact_id, evolution_message_id, direction, type, content, status, created_at, instance_name)
    SELECT p_tenant, a.deal_id, a.contact_id, h.wamid,
      CASE WHEN h.from_me THEN 'outbound' ELSE 'inbound' END,
      CASE h.mtype WHEN 'imageMessage' THEN 'image' WHEN 'videoMessage' THEN 'video'
        WHEN 'audioMessage' THEN 'audio' WHEN 'documentMessage' THEN 'document'
        WHEN 'stickerMessage' THEN 'image' WHEN 'locationMessage' THEN 'location' ELSE 'text' END,
      CASE WHEN coalesce(h.body,'') <> '' THEN h.body
        ELSE CASE h.mtype WHEN 'imageMessage' THEN '[Imagem]' WHEN 'videoMessage' THEN '[Vídeo]'
          WHEN 'audioMessage' THEN '[Áudio]' WHEN 'documentMessage' THEN '[Documento]'
          WHEN 'stickerMessage' THEN '[Figurinha]' WHEN 'locationMessage' THEN '[Localização]' ELSE '' END END,
      CASE WHEN h.from_me THEN 'sent' END,
      h.ts, 'hist-archive'
    FROM hist_archive h
    JOIN alvo a ON (h.is_lid AND a.wa_lid = h.ident)
               OR (NOT h.is_lid AND (a.phone = h.ident
                    OR (length(h.ident)=13 AND substring(h.ident,5,1)='9'
                        AND a.phone = substring(h.ident,1,4)||substring(h.ident,6))))
    WHERE h.tenant_id = p_tenant
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.evolution_message_id = h.wamid AND m.tenant_id = p_tenant)
    RETURNING deal_id
  ),
  reset AS (
    UPDATE deal_ai_state SET last_analyzed_message_at = NULL
    WHERE deal_id IN (SELECT DISTINCT deal_id FROM ins)
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;

  -- 1o contato recalculado pros reidratados
  UPDATE deal_ai_state st SET first_contact_at = m.fc
  FROM (SELECT deal_id, min(created_at) fc FROM messages WHERE tenant_id = p_tenant GROUP BY 1) m
  WHERE m.deal_id = st.deal_id AND st.tenant_id = p_tenant
    AND (st.first_contact_at IS NULL OR m.fc < st.first_contact_at);
  RETURN n;
END $$;

-- Frases de saudacao configuradas nos anuncios CTWA (deteccao de origem por
-- mensagem inicial quando a assinatura tecnica do anuncio nao vem)
ALTER TABLE public.ai_settings ADD COLUMN IF NOT EXISTS ctwa_greetings jsonb;
