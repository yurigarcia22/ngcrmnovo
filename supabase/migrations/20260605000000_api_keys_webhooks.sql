-- API publica do CRM NG: chaves de API + webhooks de saida.
-- Permite integracoes externas (n8n, ponte SimplesVet) empurrarem/lerem dados
-- e reagirem a eventos. Tenant-scoped; chave guardada so como hash (sha256).

CREATE TABLE IF NOT EXISTS public.api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  key_prefix  text NOT NULL,            -- primeiros chars (exibicao "ng_live_ab12…")
  key_hash    text NOT NULL UNIQUE,     -- sha256 hex da chave crua (nunca guardamos a crua)
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  url         text NOT NULL,
  events      text[] NOT NULL DEFAULT '{}',   -- ex: message.received, lead.created, appointment.created
  secret      text NOT NULL,                  -- p/ assinar (HMAC) o payload
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON public.webhook_endpoints(tenant_id);

ALTER TABLE public.api_keys         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_tenant_isolation ON public.api_keys;
CREATE POLICY api_keys_tenant_isolation ON public.api_keys
  FOR ALL USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS webhook_endpoints_tenant_isolation ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_tenant_isolation ON public.webhook_endpoints
  FOR ALL USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));
