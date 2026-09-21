-- A Meta pede o funil inteiro, incluindo a entrada do lead. Sem o primeiro estagio
-- ela nao consegue comparar quem avancou com quem parou.
ALTER TABLE public.meta_capi_settings ADD COLUMN IF NOT EXISTS evento_lead text NOT NULL DEFAULT 'Lead';

CREATE OR REPLACE FUNCTION public.meta_capi_push(p_deal uuid, p_tipo text, p_quando timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d deals%ROWTYPE; cfg meta_capi_settings%ROWTYPE; v_nome text;
BEGIN
  SELECT * INTO d FROM deals WHERE id = p_deal;
  IF d.id IS NULL THEN RETURN; END IF;
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

-- Card novo vindo do formulario ja entra como estagio "Lead"
CREATE OR REPLACE FUNCTION public.meta_capi_on_deal_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.meta_lead_id IS NOT NULL THEN
    PERFORM meta_capi_push(NEW.id, 'lead', coalesce(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_meta_capi_insert ON public.deals;
CREATE TRIGGER trg_meta_capi_insert AFTER INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.meta_capi_on_deal_insert();

-- Card que ganhou o lead_id depois (casamento por telefone) tambem entra
CREATE OR REPLACE FUNCTION public.meta_capi_on_deal_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE; pos_atual int; pos_alvo int; ganhou boolean;
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

  RETURN NEW;
END $$;

-- Carga inicial passa a incluir o estagio de entrada
CREATE OR REPLACE FUNCTION public.meta_capi_backfill(p_tenant uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE; pos_alvo int; n int := 0; r record;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = p_tenant AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN 0; END IF;
  SELECT position INTO pos_alvo FROM stages WHERE id = cfg.stage_agendou_id;

  FOR r IN
    SELECT d.id, d.status, d.meta_lead_id, d.created_at, d.stage_entered_at, d.updated_at,
           s.position, s.is_won, s.is_lost
    FROM deals d JOIN stages s ON s.id = d.stage_id
    WHERE d.tenant_id = p_tenant
  LOOP
    IF r.meta_lead_id IS NOT NULL THEN
      PERFORM meta_capi_push(r.id, 'lead', r.created_at);
      n := n + 1;
    END IF;
    IF pos_alvo IS NOT NULL AND r.position >= pos_alvo AND NOT r.is_lost THEN
      PERFORM meta_capi_push(r.id, 'agendou', coalesce(r.stage_entered_at, r.updated_at));
      n := n + 1;
    END IF;
    IF r.status = 'won' OR r.is_won THEN
      PERFORM meta_capi_push(r.id, 'ganhou', coalesce(r.stage_entered_at, r.updated_at));
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
