-- Nem toda perda e culpa do lead. "Contratou outra empresa" e um lead BOM que
-- perdemos na venda: dizer para a Meta que ele presta menos ensina o algoritmo
-- a fugir justamente de quem tem perfil de cliente. So avisamos quando o
-- problema e o lead: perfil errado ou dado inventado.
ALTER TABLE public.meta_capi_settings
  ADD COLUMN IF NOT EXISTS motivos_desqualificado text[] NOT NULL
    DEFAULT ARRAY['Desqualificado', 'Não tem interesse', 'Sem resposta', 'No Show'];

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
    END IF;   -- perda comercial nao vira evento
  END IF;

  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.meta_capi_backfill(p_tenant uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE; pos_alvo int; n int := 0; r record;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = p_tenant AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN 0; END IF;
  SELECT position INTO pos_alvo FROM stages WHERE id = cfg.stage_agendou_id;

  FOR r IN
    SELECT d.id, d.status, d.meta_lead_id, d.lost_reason, d.created_at, d.stage_entered_at, d.updated_at,
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
    IF (r.status = 'lost' OR r.is_lost) THEN
      IF coalesce(r.lost_reason, '') = ANY (cfg.motivos_lead_falso) THEN
        PERFORM meta_capi_push(r.id, 'falso', coalesce(r.stage_entered_at, r.updated_at));
        n := n + 1;
      ELSIF coalesce(r.lost_reason, '') = ANY (cfg.motivos_desqualificado) THEN
        PERFORM meta_capi_push(r.id, 'desqualificado', coalesce(r.stage_entered_at, r.updated_at));
        n := n + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN n;
END $$;
