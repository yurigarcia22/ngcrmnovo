-- Função para lidar com novos usuários - VERSÃO CORRIGIDA V3 (SEM COLUNA EMAIL)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_tenant_id uuid;
  invited_tenant_id uuid;
  meta_role text;
BEGIN
  -- 1. Verifica se veio um tenant_id nos metadados (convite)
  invited_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;
  meta_role := new.raw_user_meta_data->>'role';

  IF invited_tenant_id IS NOT NULL THEN
    -- CASO 1: É um CONVITE para um tenant existente
    
    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (
      new.id, 
      invited_tenant_id, 
      COALESCE(meta_role, 'vendedor'),
      new.raw_user_meta_data->>'full_name'
    );

  ELSE
    -- CASO 2: É um SIGNUP NOVO (sem convite) -> Cria nova empresa
    
    INSERT INTO public.tenants (name)
    VALUES (COALESCE(new.raw_user_meta_data->>'company_name', 'Minha Empresa'))
    RETURNING id INTO new_tenant_id;

    -- Cria o profile vinculado ao NOVO tenant
    INSERT INTO public.profiles (id, tenant_id, role, full_name)
    VALUES (
      new.id, 
      new_tenant_id, 
      'admin', 
      new.raw_user_meta_data->>'full_name'
    );
    
  END IF;

  RETURN new;
END;
$$;

-- Recriar a trigger para garantir que ela use a função atualizada
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
