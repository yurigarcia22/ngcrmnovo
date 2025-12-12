create table if not exists whatsapp_instances (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  tenant_id uuid references tenants(id) on delete cascade not null,
  instance_name text not null,
  custom_name text,
  owner_profile_id uuid references profiles(id) on delete set null,
  status text default 'disconnected',
  
  unique(instance_name)
);

-- RLS Policies
alter table whatsapp_instances enable row level security;

create policy "Users can view their tenant instances"
  on whatsapp_instances for select
  using (
    tenant_id in (
      select tenant_id from profiles where id = auth.uid()
    )
  );

create policy "Users can insert their tenant instances"
  on whatsapp_instances for insert
  with check (
    tenant_id in (
      select tenant_id from profiles where id = auth.uid()
    )
  );

create policy "Users can update their tenant instances"
  on whatsapp_instances for update
  using (
    tenant_id in (
      select tenant_id from profiles where id = auth.uid()
    )
  );

create policy "Users can delete their tenant instances"
  on whatsapp_instances for delete
  using (
    tenant_id in (
      select tenant_id from profiles where id = auth.uid()
    )
  );
