-- Conversions API da Meta: devolver para a campanha o que aconteceu com o lead
-- (reuniao agendada, cliente fechado). Sem isso o algoritmo so sabe quem preencheu
-- o formulario, e otimiza para volume de formulario em vez de para venda.

-- 1. Identificadores de atribuicao no card
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS meta_lead_id text;       -- id do lead do formulario instantaneo
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS meta_ad_id text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS meta_campaign_id text;
CREATE INDEX IF NOT EXISTS idx_deals_meta_lead ON public.deals (tenant_id, meta_lead_id) WHERE meta_lead_id IS NOT NULL;

-- 2. Configuracao por cliente. Token e dataset ficam so no servidor (sem policy de leitura).
CREATE TABLE IF NOT EXISTS public.meta_capi_settings (
  tenant_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  dataset_id text,
  access_token text,
  test_event_code text,                 -- preencher so durante o teste no Events Manager
  api_version text NOT NULL DEFAULT 'v21.0',
  stage_agendou_id bigint,              -- etapa que significa "reuniao agendada"
  evento_agendou text NOT NULL DEFAULT 'Schedule',
  evento_ganhou text NOT NULL DEFAULT 'Purchase',
  valor_padrao numeric,                 -- usado quando o card nao tem valor preenchido
  moeda text NOT NULL DEFAULT 'BRL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_capi_settings ENABLE ROW LEVEL SECURITY;

-- 3. Fila de envio: um evento por card e por tipo, com id de deduplicacao
CREATE TABLE IF NOT EXISTS public.meta_capi_events (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  event_id text NOT NULL,
  event_time timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',   -- pending | sent | error | skipped
  attempts int NOT NULL DEFAULT 0,
  request jsonb,
  response jsonb,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (deal_id, event_name)
);
CREATE INDEX IF NOT EXISTS idx_capi_fila ON public.meta_capi_events (status, created_at) WHERE status IN ('pending','error');
ALTER TABLE public.meta_capi_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Multitenant Isolation" ON public.meta_capi_events USING (tenant_id = get_my_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Enfileira um evento (sem duplicar) se o cliente tiver a integracao ligada
CREATE OR REPLACE FUNCTION public.meta_capi_push(p_deal uuid, p_tipo text, p_quando timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d deals%ROWTYPE; cfg meta_capi_settings%ROWTYPE; v_nome text;
BEGIN
  SELECT * INTO d FROM deals WHERE id = p_deal;
  IF d.id IS NULL THEN RETURN; END IF;
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = d.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN; END IF;

  v_nome := CASE WHEN p_tipo = 'agendou' THEN cfg.evento_agendou ELSE cfg.evento_ganhou END;

  INSERT INTO meta_capi_events (tenant_id, deal_id, event_name, event_id, event_time)
  VALUES (d.tenant_id, d.id, v_nome, p_tipo || '-' || d.id::text, coalesce(p_quando, now()))
  ON CONFLICT (deal_id, event_name) DO NOTHING;
END $$;

-- 5. Gatilho: card mudou de etapa ou foi ganho -> entra na fila
CREATE OR REPLACE FUNCTION public.meta_capi_on_deal_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE; pos_atual int; pos_alvo int; ganhou boolean;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = NEW.tenant_id AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN NEW; END IF;

  -- reuniao agendada: entrou na etapa alvo OU em qualquer etapa depois dela
  IF cfg.stage_agendou_id IS NOT NULL AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    SELECT position INTO pos_alvo FROM stages WHERE id = cfg.stage_agendou_id;
    SELECT position INTO pos_atual FROM stages WHERE id = NEW.stage_id;
    IF pos_alvo IS NOT NULL AND pos_atual IS NOT NULL AND pos_atual >= pos_alvo
       AND NOT EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.stage_id AND s.is_lost) THEN
      PERFORM meta_capi_push(NEW.id, 'agendou', now());
    END IF;
  END IF;

  -- fechou: status ganho ou etapa de ganho
  ganhou := NEW.status = 'won'
            OR EXISTS (SELECT 1 FROM stages s WHERE s.id = NEW.stage_id AND s.is_won);
  IF ganhou AND (OLD.status IS DISTINCT FROM NEW.status OR NEW.stage_id IS DISTINCT FROM OLD.stage_id) THEN
    PERFORM meta_capi_push(NEW.id, 'ganhou', now());
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_meta_capi ON public.deals;
CREATE TRIGGER trg_meta_capi AFTER UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.meta_capi_on_deal_change();

-- 6. Carga inicial: cards que JA estao em reuniao agendada ou fechados
CREATE OR REPLACE FUNCTION public.meta_capi_backfill(p_tenant uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg meta_capi_settings%ROWTYPE; pos_alvo int; n int := 0; r record;
BEGIN
  SELECT * INTO cfg FROM meta_capi_settings WHERE tenant_id = p_tenant AND enabled;
  IF cfg.tenant_id IS NULL THEN RETURN 0; END IF;
  SELECT position INTO pos_alvo FROM stages WHERE id = cfg.stage_agendou_id;

  FOR r IN
    SELECT d.id, d.status, d.stage_entered_at, d.updated_at, s.position, s.is_won, s.is_lost
    FROM deals d JOIN stages s ON s.id = d.stage_id
    WHERE d.tenant_id = p_tenant
  LOOP
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
