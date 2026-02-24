-- Create deal_members table
CREATE TABLE IF NOT EXISTS public.deal_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  deal_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  CONSTRAINT deal_members_pkey PRIMARY KEY (id),
  CONSTRAINT deal_members_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE,
  CONSTRAINT deal_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT deal_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id),
  CONSTRAINT deal_members_deal_user_unique UNIQUE (deal_id, user_id)
);

-- Enable RLS
ALTER TABLE public.deal_members ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for authenticated users" ON public.deal_members
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.deal_members
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable delete for authenticated users" ON public.deal_members
  FOR DELETE
  TO authenticated
  USING (true);
