create table public.loss_reasons (
  id uuid not null default uuid_generate_v4(),
  tenant_id uuid not null,
  name text not null,
  position integer default 0,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint loss_reasons_pkey primary key (id),
  constraint loss_reasons_tenant_id_fkey foreign key (tenant_id) references public.tenants(id)
);

-- RLS
alter table public.loss_reasons enable row level security;
create policy "Enable read access for all users" on public.loss_reasons for select using (true);
create policy "Enable insert access for all users" on public.loss_reasons for insert with check (true);
create policy "Enable update for all users" on public.loss_reasons for update using (true);
create policy "Enable delete for all users" on public.loss_reasons for delete using (true);

-- Update deals table
alter table public.deals add column lost_reason_id uuid references public.loss_reasons(id);
