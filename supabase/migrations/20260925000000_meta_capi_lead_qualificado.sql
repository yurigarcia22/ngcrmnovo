-- Duas correcoes no sinal que mandamos para a Meta.
--
-- 1) LEAD QUALIFICADO COMO EVENTO PROPRIO
-- A campanha de "leads de conversao" precisa de um estagio para otimizar. So
-- tinhamos reuniao agendada, que e raro: lead bom que ainda nao marcou nao
-- gerava sinal nenhum. Agora a entrada no estagio de Qualificacao ja avisa a
-- Meta que aquela pessoa presta.
--
-- 2) PARAR DE DUPLICAR A CONTAGEM DE LEADS
-- Mandavamos de volta um evento chamado "Lead" para quem ja tinha entrado pelo
-- formulario. A Meta soma os dois na mesma metrica e o painel mostrava o dobro
-- de leads. Renomeando para CRMLead o registro continua e a contagem para de
-- inflar.
ALTER TABLE public.meta_capi_settings
  ADD COLUMN IF NOT EXISTS evento_qualificado text NOT NULL DEFAULT 'QualifiedLead',
  ADD COLUMN IF NOT EXISTS stage_qualificado_id bigint;

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
    -- card etiquetado nao vira sinal de otimizacao, nem reuniao nem qualificacao
    IF v_marcado AND p_tipo IN ('agendou', 'qualificado') THEN RETURN; END IF;
  END IF;

  v_nome := CASE p_tipo
              WHEN 'lead'           THEN cfg.evento_lead
              WHEN 'qualificado'    THEN cfg.evento_qualificado
              WHEN 'agendou'        THEN cfg.evento_agendou
              WHEN 'desqualificado' THEN cfg.evento_desqualificado
              WHEN 'falso'          THEN cfg.evento_lead_falso
              ELSE cfg.evento_ganhou
            END;

  INSERT INTO meta_capi_events (tenant_id, deal_id, event_name, event_id, event_time)
  VALUES (d.tenant_id, d.id, v_nome, p_tipo || '-' || d.id::text, coalesce(p_quando, now()))
  ON CONFLICT (deal_id, event_name) DO NOTHING;
END $$;

-- Etiqueta de desqualificado tambem apaga um QualifiedLead que ainda nao saiu
CREATE OR REPLACE FUNCTION public.meta_capi_on_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = NEW.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL OR cfg.tag_desqualificado_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.tag_id = cfg.tag_desqualificado_id THEN
    DELETE FROM meta_capi_events
     WHERE deal_id = NEW.deal_id AND status = 'pending'
       AND event_name IN (cfg.evento_qualificado, cfg.evento_agendou);
    PERFORM meta_capi_push(NEW.deal_id, 'desqualificado', now());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.meta_capi_on_deal_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE; pos_atual int; pos_alvo int; ganhou boolean; perdeu boolean; motivo text;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = NEW.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.meta_lead_id IS NOT NULL AND OLD.meta_lead_id IS NULL THEN
    PERFORM meta_capi_push(NEW.id, 'lead', coalesce(NEW.created_at, now()));
  END IF;

  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT position INTO pos_atual FROM stages WHERE id = NEW.stage_id;

    -- Qualificacao: quem chega aqui (ou mais na frente) e lead bom
    IF cfg.stage_qualificado_id IS NOT NULL AND pos_atual IS NOT NULL THEN
      SELECT position INTO pos_alvo FROM stages WHERE id = cfg.stage_qualificado_id;
      IF pos_alvo IS NOT NULL AND pos_atual >= pos_alvo
         AND NOT EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.stage_id AND s.is_lost) THEN
        PERFORM meta_capi_push(NEW.id, 'qualificado', now());
      END IF;
    END IF;

    IF cfg.stage_agendou_id IS NOT NULL AND pos_atual IS NOT NULL THEN
      SELECT position INTO pos_alvo FROM stages WHERE id = cfg.stage_agendou_id;
      IF pos_alvo IS NOT NULL AND pos_atual >= pos_alvo
         AND NOT EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.stage_id AND s.is_lost) THEN
        PERFORM meta_capi_push(NEW.id, 'agendou', now());
      END IF;
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
    END IF;   -- perda comercial nao vira evento
  END IF;

  RETURN NEW;
END $$;
