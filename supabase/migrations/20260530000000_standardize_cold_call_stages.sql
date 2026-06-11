-- Padronizacao das etapas do funil de cold-call para TODOS os tenants.
-- Yuri quer exatamente estes 6 botoes de Acao Rapida iguais em todo lugar:
--   1. Ligacao Feita
--   2. Contato feito
--   3. Falou c/ decisor
--   4. Confirmado          (terminal de sucesso; webinar = confirmado)
--   5. Descartado          (terminal de negativa do lead)
--   6. Numero inexistente  (terminal de numero invalido / sem WhatsApp)
--
-- A migration eh idempotente: pode rodar varias vezes sem efeito colateral.

-- Cold-call tem DUAS terminais perdidas (Descartado e Numero inexistente),
-- entao removemos o indice unique que limitava a 1 is_lost por funil.
-- Triggers existentes so usam is_won (cold_lead_auto_convert_to_deal),
-- portanto a remocao eh segura.
DROP INDEX IF EXISTS public.stages_one_lost_per_pipeline;

DO $$
DECLARE
    p RECORD;
    next_pos INT;
BEGIN
    FOR p IN
        SELECT id, tenant_id
        FROM public.pipelines
        WHERE kind = 'cold_call' AND COALESCE(is_default, false) = true
    LOOP
        -- ----- 1. Renomeia variantes conhecidas para o nome padronizado -----
        UPDATE public.stages SET name = 'Ligação Feita'
        WHERE pipeline_id = p.id
          AND lower(name) IN ('ligacao feita', 'ligacao realizada', 'ligado');

        UPDATE public.stages SET name = 'Contato feito'
        WHERE pipeline_id = p.id
          AND lower(name) IN ('contato realizado', 'contato realizada', 'contato_realizado');

        UPDATE public.stages SET name = 'Falou c/ decisor'
        WHERE pipeline_id = p.id
          AND lower(name) IN ('falou com decisor', 'decisor', 'contato decisor', 'contato_decisor');

        UPDATE public.stages SET name = 'Confirmado'
        WHERE pipeline_id = p.id
          AND lower(name) IN ('reuniao marcada', 'reunião marcada', 'agendado', 'agendada', 'confirmou');

        UPDATE public.stages SET name = 'Descartado'
        WHERE pipeline_id = p.id
          AND lower(name) IN ('perdido', 'sem interesse', 'desinteressado', 'nao interessado', 'não interessado');

        UPDATE public.stages SET name = 'Numero inexistente'
        WHERE pipeline_id = p.id
          AND lower(name) IN ('numero invalido', 'número invalido', 'sem whatsapp', 'invalido', 'inválido', 'número inexistente');

        -- Zera is_won/is_lost de TODAS as stages do funil antes de re-aplicar
        -- nas 6 padronizadas. Evita conflito com os indices unique parciais
        -- (ex.: "Convertido" antiga is_won=true bloqueando setar "Confirmado").
        UPDATE public.stages SET is_won = false, is_lost = false
        WHERE pipeline_id = p.id;

        -- ----- 2. Garante presenca das 6 etapas padronizadas (cria as faltantes) -----
        IF NOT EXISTS (SELECT 1 FROM public.stages WHERE pipeline_id = p.id AND name = 'Ligação Feita') THEN
            SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos FROM public.stages WHERE pipeline_id = p.id;
            INSERT INTO public.stages (pipeline_id, tenant_id, name, position, is_inbox, is_quick_action, is_won, is_lost)
            VALUES (p.id, p.tenant_id, 'Ligação Feita', next_pos, false, true, false, false);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.stages WHERE pipeline_id = p.id AND name = 'Contato feito') THEN
            SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos FROM public.stages WHERE pipeline_id = p.id;
            INSERT INTO public.stages (pipeline_id, tenant_id, name, position, is_inbox, is_quick_action, is_won, is_lost)
            VALUES (p.id, p.tenant_id, 'Contato feito', next_pos, false, true, false, false);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.stages WHERE pipeline_id = p.id AND name = 'Falou c/ decisor') THEN
            SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos FROM public.stages WHERE pipeline_id = p.id;
            INSERT INTO public.stages (pipeline_id, tenant_id, name, position, is_inbox, is_quick_action, is_won, is_lost)
            VALUES (p.id, p.tenant_id, 'Falou c/ decisor', next_pos, false, true, false, false);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.stages WHERE pipeline_id = p.id AND name = 'Confirmado') THEN
            SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos FROM public.stages WHERE pipeline_id = p.id;
            INSERT INTO public.stages (pipeline_id, tenant_id, name, position, is_inbox, is_quick_action, is_won, is_lost)
            VALUES (p.id, p.tenant_id, 'Confirmado', next_pos, false, true, true, false);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.stages WHERE pipeline_id = p.id AND name = 'Descartado') THEN
            SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos FROM public.stages WHERE pipeline_id = p.id;
            INSERT INTO public.stages (pipeline_id, tenant_id, name, position, is_inbox, is_quick_action, is_won, is_lost)
            VALUES (p.id, p.tenant_id, 'Descartado', next_pos, false, true, false, true);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM public.stages WHERE pipeline_id = p.id AND name = 'Numero inexistente') THEN
            SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos FROM public.stages WHERE pipeline_id = p.id;
            INSERT INTO public.stages (pipeline_id, tenant_id, name, position, is_inbox, is_quick_action, is_won, is_lost)
            VALUES (p.id, p.tenant_id, 'Numero inexistente', next_pos, false, true, false, true);
        END IF;

        -- ----- 3. Marca SOMENTE essas 6 como Acao Rapida, na ordem correta -----
        UPDATE public.stages SET is_quick_action = false WHERE pipeline_id = p.id;

        UPDATE public.stages SET is_quick_action = true, position = 1, is_won = false, is_lost = false
            WHERE pipeline_id = p.id AND name = 'Ligação Feita';
        UPDATE public.stages SET is_quick_action = true, position = 2, is_won = false, is_lost = false
            WHERE pipeline_id = p.id AND name = 'Contato feito';
        UPDATE public.stages SET is_quick_action = true, position = 3, is_won = false, is_lost = false
            WHERE pipeline_id = p.id AND name = 'Falou c/ decisor';
        UPDATE public.stages SET is_quick_action = true, position = 4, is_won = true,  is_lost = false
            WHERE pipeline_id = p.id AND name = 'Confirmado';
        UPDATE public.stages SET is_quick_action = true, position = 5, is_won = false, is_lost = true
            WHERE pipeline_id = p.id AND name = 'Descartado';
        UPDATE public.stages SET is_quick_action = true, position = 6, is_won = false, is_lost = true
            WHERE pipeline_id = p.id AND name = 'Numero inexistente';

        -- ----- 4. Garante que existe uma stage de entrada (is_inbox) -----
        IF NOT EXISTS (SELECT 1 FROM public.stages WHERE pipeline_id = p.id AND is_inbox = true) THEN
            INSERT INTO public.stages (pipeline_id, tenant_id, name, position, is_inbox, is_quick_action, is_won, is_lost)
            VALUES (p.id, p.tenant_id, 'Novo', 0, true, false, false, false);
        END IF;
    END LOOP;
END $$;
