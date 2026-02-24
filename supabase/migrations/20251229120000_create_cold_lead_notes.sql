create table public.cold_lead_notes (
  id uuid not null default uuid_generate_v4(),
  cold_lead_id uuid not null,
  content text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  created_by uuid references public.profiles(id),
  constraint cold_lead_notes_pkey primary key (id),
  constraint cold_lead_notes_cold_lead_id_fkey foreign key (cold_lead_id) references public.cold_leads(id) on delete cascade
);

-- RLS
alter table public.cold_lead_notes enable row level security;

create policy "Enable read access for all users" on public.cold_lead_notes for select using (true);
create policy "Enable insert access for all users" on public.cold_lead_notes for insert with check (true);
create policy "Enable update for users based on email" on public.cold_lead_notes for update using (true);

-- Index
create index cold_lead_notes_cold_lead_id_idx on public.cold_lead_notes (cold_lead_id);
