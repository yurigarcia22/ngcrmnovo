-- So vai para a Meta quem veio de anuncio. Card de indicacao, prospeccao ativa
-- ou cadastro manual nao pode entrar: a Meta casaria pelo telefone e atribuiria
-- ao anuncio uma venda que nao foi dele.
CREATE OR REPLACE FUNCTION public.meta_capi_push(p_deal uuid, p_tipo text, p_quando timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d deals%ROWTYPE; cfg meta_capi_settings%ROWTYPE; v_nome text;
BEGIN
  SELECT * INTO d FROM deals WHERE id = p_deal;
  IF d.id IS NULL THEN RETURN; END IF;

  -- sem identificador de anuncio, nao existe evento
  IF d.meta_lead_id IS NULL AND d.ctwa_clid IS NULL THEN RETURN; END IF;

  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = d.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN; END IF;

  v_nome := CASE p_tipo
              WHEN 'lead'    THEN cfg.evento_lead
              WHEN 'agendou' THEN cfg.evento_agendou
              ELSE cfg.evento_ganhou
            END;

  INSERT INTO meta_capi_events (tenant_id, deal_id, event_name, event_id, event_time)
  VALUES (d.tenant_id, d.id, v_nome, p_tipo || '-' || d.id::text, coalesce(p_quando, now()))
  ON CONFLICT (deal_id, event_name) DO NOTHING;
END $$;

-- Limpa o que entrou errado (card sem origem de anuncio) e o que a Meta ja recusou por idade
DELETE FROM public.meta_capi_events e
USING public.deals d
WHERE d.id = e.deal_id
  AND d.meta_lead_id IS NULL AND d.ctwa_clid IS NULL;

UPDATE public.meta_capi_events
SET status = 'skipped',
    detail = 'fora da janela de 7 dias da Meta',
    attempts = 0
WHERE status IN ('pending', 'error')
  AND event_time < now() - interval '7 days';
