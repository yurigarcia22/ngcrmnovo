-- Migration for Cold Call Follow-ups Module

-- 1. Create the new cold_call_followups table
CREATE TABLE IF NOT EXISTS public.cold_call_followups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cold_lead_id UUID NOT NULL REFERENCES public.cold_leads(id) ON DELETE CASCADE,
    responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Assuming auth.users is present or just UUID if they use another scheme
    tenant_id UUID NOT NULL, -- Keep multi-tenant architecture
    
    data_agendada DATE NOT NULL,
    periodo TEXT NOT NULL CHECK (periodo IN ('manha', 'tarde', 'noite', 'qualquer')),
    horario_especifico TIME,
    
    tipo_acao TEXT NOT NULL CHECK (tipo_acao IN ('ligacao', 'whatsapp', 'email', 'retorno_prometido', 'nova_tentativa')),
    objetivo TEXT,
    prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluido', 'atrasado', 'reagendado', 'cancelado')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast querying by lead and status
CREATE INDEX IF NOT EXISTS idx_cold_call_followups_lead ON public.cold_call_followups(cold_lead_id);
CREATE INDEX IF NOT EXISTS idx_cold_call_followups_status ON public.cold_call_followups(status);
CREATE INDEX IF NOT EXISTS idx_cold_call_followups_data ON public.cold_call_followups(data_agendada, periodo);

-- Row Level Security (RLS) for cold_call_followups
ALTER TABLE public.cold_call_followups ENABLE ROW LEVEL SECURITY;

-- Creating policies (Assumes standard auth behavior mimicking existing tables)
CREATE POLICY "Users can view followups in their tenant" ON public.cold_call_followups
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert followups in their tenant" ON public.cold_call_followups
    FOR INSERT WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update followups in their tenant" ON public.cold_call_followups
    FOR UPDATE USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete followups in their tenant" ON public.cold_call_followups
    FOR DELETE USING (
        tenant_id IN (
            SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- 2. Update cold_leads constraints
-- We need to drop the old check constraint on status and add the new one.
-- Depending on how the constraint was named automatically, we might have to dynamically drop it.
-- BUT in Postgres, we can do this via an anonymous block or if we know the name. 
-- Assuming standard naming `cold_leads_status_check`.
DO $$ 
DECLARE
    const_name text;
BEGIN
    SELECT constraint_name INTO const_name 
    FROM information_schema.constraint_column_usage 
    WHERE table_name = 'cold_leads' AND column_name = 'status';

    IF const_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.cold_leads DROP CONSTRAINT ' || const_name;
    END IF;
END $$;

-- Add the new constraint with expanded statuses
ALTER TABLE public.cold_leads
ADD CONSTRAINT cold_leads_status_check
CHECK (status IN (
    'novo_lead', 
    'novo',
    'tentativa_inicial',
    'lead_qualificado', 
    'ligacao_feita', 
    'contato_realizado', 
    'contato_decisor', 
    'em_follow_up',
    'aguardando_retorno',
    'sem_interesse',
    'nao_consegui_contato',
    'perdido',
    'convertido',
    'reuniao_marcada',
    'numero_inexistente'
));

-- Create the function if it doesn't exist (handle updated_at)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at for followups
CREATE TRIGGER set_cold_call_followups_timestamp
BEFORE UPDATE ON public.cold_call_followups
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

