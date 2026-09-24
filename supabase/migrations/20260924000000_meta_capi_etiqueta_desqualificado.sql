-- Lead desqualificado que MESMO ASSIM marcou reuniao.
--
-- O problema: se o card anda ate "Reuniao Agendada", sai o evento que a campanha
-- usa para otimizar, e a Meta passa a procurar mais gente igual aquela. Marcar
-- como perdido resolveria o sinal, mas tira o card do funil e o vendedor ainda
-- precisa realizar a reuniao.
--
-- A solucao: uma etiqueta no card. Ela avisa a Meta que o lead nao presta E
-- cala o evento de reuniao daquele card especifico.
ALTER TABLE public.meta_capi_settings
  ADD COLUMN IF NOT EXISTS tag_desqualificado_id bigint;

-- Nao manda evento de reuniao para card etiquetado como desqualificado
CREATE OR REPLACE FUNCTION public.meta_capi_push(p_deal uuid, p_tipo text, p_quando timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d deals%ROWTYPE; cfg meta_capi_settings%ROWTYPE; v_nome text; v_marcado boolean;
BEGIN
  SELECT * INTO d FROM deals WHERE id = p_deal;
  IF d.id IS NULL THEN RETURN; END IF;
  IF d.meta_lead_id IS NULL AND d.ctwa_clid IS NULL THEN RETURN; END IF;

  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = d.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN; END IF;

  IF cfg.tag_desqualificado_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM deal_tags dt
                   WHERE dt.deal_id = d.id AND dt.tag_id = cfg.tag_desqualificado_id)
      INTO v_marcado;
    -- reuniao de lead desqualificado NAO vira sinal de otimizacao
    IF v_marcado AND p_tipo = 'agendou' THEN RETURN; END IF;
  END IF;

  v_nome := CASE p_tipo
              WHEN 'lead'           THEN cfg.evento_lead
              WHEN 'agendou'        THEN cfg.evento_agendou
              WHEN 'desqualificado' THEN cfg.evento_desqualificado
              WHEN 'falso'          THEN cfg.evento_lead_falso
              ELSE cfg.evento_ganhou
            END;

  INSERT INTO meta_capi_events (tenant_id, deal_id, event_name, event_id, event_time)
  VALUES (d.tenant_id, d.id, v_nome, p_tipo || '-' || d.id::text, coalesce(p_quando, now()))
  ON CONFLICT (deal_id, event_name) DO NOTHING;
END $$;

-- Colocou a etiqueta: avisa a Meta na hora
CREATE OR REPLACE FUNCTION public.meta_capi_on_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = NEW.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL OR cfg.tag_desqualificado_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.tag_id = cfg.tag_desqualificado_id THEN
    PERFORM meta_capi_push(NEW.deal_id, 'desqualificado', now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_meta_capi_tag ON public.deal_tags;
CREATE TRIGGER trg_meta_capi_tag AFTER INSERT ON public.deal_tags
  FOR EACH ROW EXECUTE FUNCTION public.meta_capi_on_tag();
