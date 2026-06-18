-- Modulo Clinica Veterinaria (vertical pet) — Fase 1: fundacao de dados.
-- Pets vinculados ao tutor (contact) e carteira de vacinas por pet.
-- Aditivo: nao altera nenhuma tabela existente. Ativado por tenant via
-- tenant_modules (module_key='veterinaria').

-- ============================================================
-- 1. PETS (1 tutor/contact -> N pets)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  contact_id  uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  species     text,            -- cao, gato, outro
  breed       text,            -- raca
  sex         text,            -- macho, femea
  birth_date  date,            -- nascimento (idade + aniversario)
  weight_kg   numeric,
  neutered    boolean DEFAULT false,  -- castrado
  color       text,
  microchip   text,
  photo_url   text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pets_tenant  ON public.pets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pets_contact ON public.pets(contact_id);

-- ============================================================
-- 2. CARTEIRA DE VACINAS (por pet)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pet_vaccines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  pet_id        uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  vaccine_name  text NOT NULL,   -- V8, V10, Antirrabica, Gripe...
  applied_at    date,            -- data de aplicacao
  next_due_at   date,            -- proxima dose / reforco (base do lembrete)
  veterinarian  text,            -- quem aplicou
  batch         text,            -- lote
  notes         text,
  reminder_sent boolean DEFAULT false,  -- ja avisou o tutor deste vencimento?
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pet_vaccines_tenant ON public.pet_vaccines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pet_vaccines_pet    ON public.pet_vaccines(pet_id);
-- Indice parcial para o cron de lembretes (so vencimentos ainda nao avisados).
CREATE INDEX IF NOT EXISTS idx_pet_vaccines_due
  ON public.pet_vaccines(next_due_at)
  WHERE next_due_at IS NOT NULL AND reminder_sent = false;

-- ============================================================
-- 3. RLS — mesmo padrao do CRM (isolamento por tenant)
-- ============================================================
ALTER TABLE public.pets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_vaccines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pets_tenant_isolation ON public.pets;
CREATE POLICY pets_tenant_isolation ON public.pets
  FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));

DROP POLICY IF EXISTS pet_vaccines_tenant_isolation ON public.pet_vaccines;
CREATE POLICY pet_vaccines_tenant_isolation ON public.pet_vaccines
  FOR ALL
  USING (tenant_id = (SELECT current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()));
