-- Função para lidar com novos usuários
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
  -- Nota: O operador ->> retorna text, então fazemos cast para uuid se não for null
  invited_tenant_id := (new.raw_user_meta_data->>'tenant_id')::uuid;
  meta_role := new.raw_user_meta_data->>'role';

  IF invited_tenant_id IS NOT NULL THEN
    -- CASO 1: É um CONVITE para um tenant existente
    
    -- Inserimos o profile vinculado ao tenant existente
    INSERT INTO public.profiles (id, email, tenant_id, role, full_name)
    VALUES (
      new.id, 
      new.email, 
      invited_tenant_id, 
      COALESCE(meta_role, 'vendedor'), -- usa o cargo do convite ou fallback
      new.raw_user_meta_data->>'full_name'
    );
    
    -- Se você usar tabela separada de user_tenants (mujito comum em multi-tenant), descomente abaixo:
    -- INSERT INTO public.user_tenants (user_id, tenant_id, role)
    -- VALUES (new.id, invited_tenant_id, COALESCE(meta_role, 'member'));

  ELSE
    -- CASO 2: É um SIGNUP NOVO (sem convite) -> Cria nova empresa
    
    INSERT INTO public.tenants (name)
    VALUES (COALESCE(new.raw_user_meta_data->>'company_name', 'Minha Empresa'))
    RETURNING id INTO new_tenant_id;

    -- Cria o profile vinculado ao NOVO tenant
    INSERT INTO public.profiles (id, email, tenant_id, role, full_name)
    VALUES (
      new.id, 
      new.email, 
      new_tenant_id, 
      'admin', -- Quem cria a empresa é admin
      new.raw_user_meta_data->>'full_name'
    );
    
    -- Se usar user_tenants:
    -- INSERT INTO public.user_tenants (user_id, tenant_id, role)
    -- VALUES (new.id, new_tenant_id, 'owner');
    
  END IF;

  RETURN new;
END;
$$;

-- Recriar a trigger para garantir que ela use a função atualizada
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
