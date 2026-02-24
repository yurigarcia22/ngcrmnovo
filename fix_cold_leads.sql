-- 1. Adicionar Foreign Key para responsavel_id (Integridade de dados)
ALTER TABLE public.cold_leads
DROP CONSTRAINT IF EXISTS cold_leads_responsavel_id_fkey;

ALTER TABLE public.cold_leads
ADD CONSTRAINT cold_leads_responsavel_id_fkey
FOREIGN KEY (responsavel_id)
REFERENCES public.profiles(id);

-- 2. Habilitar RLS (caso não esteja)
ALTER TABLE public.cold_leads ENABLE ROW LEVEL SECURITY;

-- 3. Criar policiticas de acesso (RLS)
-- Remover políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Enable read access for all users" ON public.cold_leads;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.cold_leads;
DROP POLICY IF EXISTS "Enable update for users based on tenant" ON public.cold_leads;
DROP POLICY IF EXISTS "Enable delete for users based on tenant" ON public.cold_leads;
DROP POLICY IF EXISTS "Users can view their own tenant's cold leads" ON public.cold_leads;
DROP POLICY IF EXISTS "Users can update their own tenant's cold leads" ON public.cold_leads;

-- Política de LEITURA (SELECT)
CREATE POLICY "Users can view their own tenant's cold leads"
ON public.cold_leads
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  OR
  tenant_id = '00000000-0000-0000-0000-000000000000'::uuid -- Permite ver leads do tenant default (importados sem tenant)
);

-- Política de ATUALIZAÇÃO (UPDATE)
CREATE POLICY "Users can update their own tenant's cold leads"
ON public.cold_leads
FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  OR
  tenant_id = '00000000-0000-0000-0000-000000000000'::uuid -- Permite "adotar" leads do default
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
  OR
  tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
);

-- Política de INSERÇÃO (INSERT)
CREATE POLICY "Users can insert cold leads"
ON public.cold_leads
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Política de EXCLUSÃO (DELETE)
CREATE POLICY "Users can delete their own tenant's cold leads"
ON public.cold_leads
FOR DELETE
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  )
);
