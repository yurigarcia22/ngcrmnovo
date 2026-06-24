-- Modulo Disparos (Prospeccao WhatsApp): campanhas de disparo em massa pelo
-- numero conectado no CRM (Evolution), com fila, delay configuravel, cap diario
-- e variacoes de mensagem (anti-ban). Tenant-scoped.

CREATE TABLE IF NOT EXISTS public.dispatch_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  name            text NOT NULL,
  instance_name   text NOT NULL,             -- numero conectado (whatsapp_instances) que envia
  messages        text[] NOT NULL DEFAULT '{}',  -- 1-3 variacoes (com {nome})
  interval_min_sec integer NOT NULL DEFAULT 40,
  interval_max_sec integer NOT NULL DEFAULT 120,
  daily_cap       integer NOT NULL DEFAULT 200,
  business_hours_only boolean NOT NULL DEFAULT true,  -- 8h-20h America/Sao_Paulo
  status          text NOT NULL DEFAULT 'draft',      -- draft | running | paused | done
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_sent_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_campaigns_tenant ON public.dispatch_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_campaigns_running ON public.dispatch_campaigns(status) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.dispatch_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.dispatch_campaigns(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  name        text,
  phone       text NOT NULL,                 -- canonico (55 + DDD + numero)
  status      text NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_recipients_campaign ON public.dispatch_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_recipients_pending ON public.dispatch_recipients(campaign_id, status) WHERE status = 'pending';

ALTER TABLE public.dispatch_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispatch_campaigns_tenant_isolation ON public.dispatch_campaigns;
CREATE POLICY dispatch_campaigns_tenant_isolation ON public.dispatch_campaigns
  FOR ALL USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS dispatch_recipients_tenant_isolation ON public.dispatch_recipients;
CREATE POLICY dispatch_recipients_tenant_isolation ON public.dispatch_recipients
  FOR ALL USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));
