-- Biblioteca de cases reais do Grupo NG (prova social pro diagnostico).
-- Curada pelo tenant; o diagnostico puxa o case do nicho mais proximo e injeta
-- como prova. Numeros aqui sao REAIS e verificados, nunca gerados por IA.

CREATE TABLE IF NOT EXISTS public.prospeccao_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  nicho         text NOT NULL,           -- ex: "educacao", "ensino superior", "pos-graduacao"
  cliente       text,                    -- nome do cliente (pode ficar anonimo no PDF se sensivel)
  cliente_publico boolean NOT NULL DEFAULT true,  -- pode citar o nome no PDF?
  headline      text NOT NULL,           -- frase-resumo do resultado
  metrica       text NOT NULL,           -- ex: "Taxa de conversao"
  valor_antes   text,                    -- ex: "5%"
  valor_depois  text,                    -- ex: "27%"
  prazo         text,                    -- ex: "no primeiro mes"
  o_que_fizemos text,                    -- 1-2 frases do que foi feito
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospeccao_cases_tenant ON public.prospeccao_cases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_prospeccao_cases_nicho ON public.prospeccao_cases(tenant_id, nicho) WHERE ativo;

ALTER TABLE public.prospeccao_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prospeccao_cases_tenant_isolation ON public.prospeccao_cases;
CREATE POLICY prospeccao_cases_tenant_isolation ON public.prospeccao_cases
  FOR ALL USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));
