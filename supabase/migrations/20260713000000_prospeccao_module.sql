-- Modulo Prospeccao (camada de pesquisa/dossie): antes de abordar, o sistema
-- enriquece a empresa (CNPJ + socios via BrasilAPI, texto do site) e gera um
-- dossie com observacoes reais, gancho, insight e a 1a mensagem. Aditivo: nao
-- toca nos modulos de disparo/webinar existentes. Tenant-scoped.

CREATE TABLE IF NOT EXISTS public.prospeccao_leads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  empresa         text NOT NULL,
  cnpj            text,
  site            text,
  instagram       text,
  telefone        text,                       -- canonico (55 + DDD + numero) quando houver
  cidade          text,
  nicho           text,
  status          text NOT NULL DEFAULT 'novo',  -- novo | pesquisando | pronto | aprovado | erro
  socio           text,                       -- primeiro nome do socio-administrador (QSA)
  dossie          jsonb,                      -- { observacoes[], dor, gancho, insight_gratis, mensagem_1 }
  raw_enrichment  jsonb,                      -- dados brutos (receita, trecho do site) para auditoria
  erro            text,                       -- ultima mensagem de erro do enriquecimento
  enriched_at     timestamptz,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospeccao_leads_tenant ON public.prospeccao_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prospeccao_leads_status ON public.prospeccao_leads(tenant_id, status);

ALTER TABLE public.prospeccao_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospeccao_leads_tenant_isolation ON public.prospeccao_leads;
CREATE POLICY prospeccao_leads_tenant_isolation ON public.prospeccao_leads
  FOR ALL USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));
