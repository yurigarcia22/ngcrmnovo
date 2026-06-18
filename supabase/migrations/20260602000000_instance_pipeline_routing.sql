-- Roteamento de funil por instancia (numero) de WhatsApp.
-- Cada conexao pode apontar para um funil (pipeline kind='deals'); leads novos
-- daquela conexao entram na coluna de entrada (is_inbox) daquele funil.
-- Sem pipeline_id definido, cai no funil padrao do tenant (comportamento atual).

ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS pipeline_id bigint
  REFERENCES public.pipelines(id) ON DELETE SET NULL;

-- Retorna a stage de entrada do funil configurado na instancia.
-- Prioriza a stage marcada como is_inbox; se o funil nao tiver, usa a primeira
-- por posicao. Se p_pipeline_id for NULL, cai no funil padrao do tenant.
-- Restringe a funis de venda (kind='deals') por seguranca.
CREATE OR REPLACE FUNCTION public.get_inbox_stage_for_instance(
  p_tenant_id uuid,
  p_pipeline_id bigint
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT s.id
  FROM public.stages s
  JOIN public.pipelines p ON p.id = s.pipeline_id
  WHERE p.tenant_id = p_tenant_id
    AND p.kind = 'deals'
    AND (
      (p_pipeline_id IS NOT NULL AND s.pipeline_id = p_pipeline_id)
      OR (p_pipeline_id IS NULL AND p.is_default = true)
    )
  ORDER BY (s.is_inbox = true) DESC NULLS LAST, s.position ASC
  LIMIT 1;
$$;
