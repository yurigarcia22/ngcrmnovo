-- BLINDAGEM MULTI-TENANT: impede deal apontar para etapa de OUTRO tenant.
--
-- Causa: encontramos 106 deals cruzados (103 do Sigma na etapa "Stand-by" do
-- Grupo NG, 3 da Zenite na "Novo" do Grupo NG). Ficavam INVISIVEIS para todo
-- mundo: o dono nao ve porque a etapa nao esta nos funis dele, o outro tenant
-- nao ve por causa do RLS. Dados ja corrigidos; este trigger garante que nunca
-- mais acontece, seja por bug de codigo ou por escrita direta.

CREATE OR REPLACE FUNCTION public.enforce_deal_stage_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage_id IS NOT NULL AND NEW.tenant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.stages s
      WHERE s.id = NEW.stage_id AND s.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'stage % nao pertence ao tenant % do deal', NEW.stage_id, NEW.tenant_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_stage_tenant ON public.deals;
CREATE TRIGGER trg_deal_stage_tenant
  BEFORE INSERT OR UPDATE OF stage_id, tenant_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.enforce_deal_stage_tenant();

-- Mesma protecao para leads de cold call (0 casos hoje, mas o vetor e igual).
CREATE OR REPLACE FUNCTION public.enforce_cold_lead_stage_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stage_id IS NOT NULL AND NEW.tenant_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.stages s
      WHERE s.id = NEW.stage_id AND s.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'stage % nao pertence ao tenant % do cold_lead', NEW.stage_id, NEW.tenant_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cold_lead_stage_tenant ON public.cold_leads;
CREATE TRIGGER trg_cold_lead_stage_tenant
  BEFORE INSERT OR UPDATE OF stage_id, tenant_id ON public.cold_leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cold_lead_stage_tenant();
