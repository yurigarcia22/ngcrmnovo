-- Create deal_contacts table for multi-contact support
CREATE TABLE IF NOT EXISTS public.deal_contacts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  deal_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  title text, -- Job Title / Role
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  
  CONSTRAINT deal_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT deal_contacts_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_deal_contacts_deal_id ON public.deal_contacts(deal_id);

-- RLS
ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all for authenticated users (simplification as per current pattern, ideally should check tenant)
CREATE POLICY "Enable all access for authenticated users" ON public.deal_contacts
    FOR ALL USING (auth.role() = 'authenticated');
