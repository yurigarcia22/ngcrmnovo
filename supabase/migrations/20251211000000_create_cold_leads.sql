-- Create cold_leads table
-- Reset table to ensure new schema/constraints apply
drop trigger if exists trg_update_cold_leads_updated_at on cold_leads;
drop table if exists cold_leads;

create table if not exists cold_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  -- Core Lead Data
  nome text not null,
  responsavel_id uuid, -- Optional link to auth.users or public.users
  telefone text not null,
  google_meu_negocio_url text,
  site_url text,
  instagram_url text,
  nicho text not null,
  
  -- Status & Cadence
  status text not null default 'novo_lead' check (status in ('novo_lead', 'lead_qualificado', 'ligacao_feita', 'contato_realizado', 'contato_decisor', 'reuniao_marcada')),
  tentativas integer not null default 0,
  proxima_ligacao timestamptz,
  ultima_interacao timestamptz,
  ultimo_resultado text,
  notas text
);

-- Indices for performance
create index if not exists idx_cold_leads_responsavel_id on cold_leads(responsavel_id);
create index if not exists idx_cold_leads_status on cold_leads(status);
create index if not exists idx_cold_leads_proxima_ligacao on cold_leads(proxima_ligacao);
create index if not exists idx_cold_leads_nicho on cold_leads(nicho);

-- Updated_at trigger setup
create or replace function update_cold_leads_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_update_cold_leads_updated_at
before update on cold_leads
for each row
execute function update_cold_leads_updated_at();

-- Comment on table and columns
comment on table cold_leads is 'Leads for Cold Calling / Active Prospecting module';
comment on column cold_leads.status is 'novo, em_contato, follow_up, sem_interesse, converted';
