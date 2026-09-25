-- Correcao: lead qualificado e julgamento, nao passo de esteira.
--
-- O card nasce direto no estagio "Qualificacao" (13 dos 15 que estao la nunca
-- foram movidos). Entao "entrou em Qualificacao" nao significa nada: seria o
-- mesmo que mandar de volta todo lead do formulario, exatamente o problema que
-- acabamos de resolver com o CRMLead. Pior: qualquer movimento para frente
-- disparava o evento, ate mover para No Show.
--
-- Agora o QualifiedLead sai de uma etiqueta, igual ao desqualificado. Alguem
-- olhou o lead e disse que presta.
ALTER TABLE public.meta_capi_settings
  ADD COLUMN IF NOT EXISTS tag_qualificado_id bigint;

-- Tira o gatilho por estagio
CREATE OR REPLACE FUNCTION public.meta_capi_on_deal_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE; pos_atual int; pos_alvo int; ganhou boolean; perdeu boolean; motivo text;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = NEW.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.meta_lead_id IS NOT NULL AND OLD.meta_lead_id IS NULL THEN
    PERFORM meta_capi_push(NEW.id, 'lead', coalesce(NEW.created_at, now()));
  END IF;

  IF cfg.stage_agendou_id IS NOT NULL AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT position INTO pos_alvo FROM stages WHERE id = cfg.stage_agendou_id;
    SELECT position INTO pos_atual FROM stages WHERE id = NEW.stage_id;
    IF pos_alvo IS NOT NULL AND pos_atual IS NOT NULL AND pos_atual >= pos_alvo
       AND NOT EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.stage_id AND s.is_lost) THEN
      PERFORM meta_capi_push(NEW.id, 'agendou', now());
    END IF;
  END IF;

  ganhou := NEW.status = 'won'
            OR EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.stage_id AND s.is_won);
  IF ganhou AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
    PERFORM meta_capi_push(NEW.id, 'ganhou', now());
  END IF;

  perdeu := NEW.status = 'lost'
            OR EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.stage_id AND s.is_lost);
  IF perdeu AND (OLD.status IS DISTINCT FROM NEW.status
                 OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
                 OR NEW.lost_reason IS DISTINCT FROM OLD.lost_reason) THEN
    motivo := coalesce(NEW.lost_reason, '');
    IF motivo = ANY (cfg.motivos_lead_falso) THEN
      PERFORM meta_capi_push(NEW.id, 'falso', now());
    ELSIF motivo = ANY (cfg.motivos_desqualificado) THEN
      PERFORM meta_capi_push(NEW.id, 'desqualificado', now());
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- As duas etiquetas de julgamento: uma manda o sinal bom, a outra o ruim
CREATE OR REPLACE FUNCTION public.meta_capi_on_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = NEW.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN NEW; END IF;

  IF cfg.tag_desqualificado_id IS NOT NULL AND NEW.tag_id = cfg.tag_desqualificado_id THEN
    DELETE FROM meta_capi_events
     WHERE deal_id = NEW.deal_id AND status IN ('pending', 'error')
       AND event_name IN (cfg.evento_qualificado, cfg.evento_agendou);
    PERFORM meta_capi_push(NEW.deal_id, 'desqualificado', now());
  ELSIF cfg.tag_qualificado_id IS NOT NULL AND NEW.tag_id = cfg.tag_qualificado_id THEN
    PERFORM meta_capi_push(NEW.deal_id, 'qualificado', now());
  END IF;

  RETURN NEW;
END $$;
