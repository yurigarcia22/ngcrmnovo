-- Define quais etapas do funil aparecem como botoes de "acao rapida"
-- no modal de cold-call. Configuravel por etapa em Configuracoes > Funis.
ALTER TABLE public.stages
    ADD COLUMN IF NOT EXISTS is_quick_action boolean NOT NULL DEFAULT false;

-- Seed: nos funis de cold_call, todas as etapas que NAO sao a de entrada (is_inbox)
-- viram acoes rapidas por padrao, para os funis ja existentes funcionarem na hora.
-- O usuario liga/desliga depois em Configuracoes > Funis.
UPDATE public.stages s
SET is_quick_action = true
FROM public.pipelines p
WHERE s.pipeline_id = p.id
  AND p.kind = 'cold_call'
  AND COALESCE(s.is_inbox, false) = false;
