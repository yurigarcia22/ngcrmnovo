-- Acesso SO LEITURA pra conferencia de relatorios (outro chat do Claude), pela API:
--   POST /rest/v1/rpc/consulta_leitura {"sql": "select ..."}  com o token do papel relatorios_leitura.
-- O papel so tem SELECT numa lista fechada de tabelas (nada de senha, token, chave ou payload bruto
-- de webhook, que traz a apikey da instancia da Evolution) e a funcao roda em transacao somente leitura.
-- BYPASSRLS porque o relatorio cruza todas as clinicas.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'relatorios_leitura') THEN
    CREATE ROLE relatorios_leitura NOLOGIN BYPASSRLS;
  END IF;
END $$;
GRANT relatorios_leitura TO authenticator;
GRANT USAGE ON SCHEMA public TO relatorios_leitura;

GRANT SELECT ON
  public.messages, public.deals, public.contacts, public.deal_contacts, public.deal_members,
  public.pipelines, public.stages, public.tags, public.deal_tags, public.loss_reasons,
  public.acquisition_channels, public.products, public.deal_items, public.notes, public.tasks,
  public.appointments, public.crm_events, public.deal_ai_state, public.ai_analysis, public.ai_settings,
  public.ai_stage_mapping, public.meta_capi_events, public.dispatch_campaigns, public.dispatch_recipients,
  public.hist_archive, public.goals, public.pets, public.pet_vaccines, public.vet_services
TO relatorios_leitura;

-- Coluna por coluna onde a tabela guarda algo sensivel
GRANT SELECT (id, name, slug, is_active, plan, created_at) ON public.tenants TO relatorios_leitura;
GRANT SELECT (id, full_name, avatar_url, role, phone_number, is_active, is_online, last_lead_received_at,
              evolution_instance, tenant_id) ON public.profiles TO relatorios_leitura;
GRANT SELECT (id, tenant_id, instance_name, status, custom_name, phone_number, purpose, pipeline_id,
              owner_profile_id, created_at) ON public.whatsapp_instances TO relatorios_leitura;

CREATE OR REPLACE FUNCTION public.consulta_leitura(sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE resultado jsonb;
BEGIN
  IF current_user <> 'relatorios_leitura' THEN
    RAISE EXCEPTION 'consulta_leitura e so pro papel relatorios_leitura';
  END IF;
  SET LOCAL transaction_read_only = on;
  SET LOCAL statement_timeout = '30s';
  EXECUTE format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', sql) INTO resultado;
  RETURN resultado;
END $$;

REVOKE ALL ON FUNCTION public.consulta_leitura(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consulta_leitura(text) TO relatorios_leitura;

NOTIFY pgrst, 'reload schema';
