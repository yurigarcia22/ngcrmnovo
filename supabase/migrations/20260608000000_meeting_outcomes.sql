-- =====================================================================
-- Resultado das reunioes marcadas (cold call): aconteceu / cancelada / no-show
-- Cada reuniao = uma nota "Interação Registrada: reuniao_marcada" (note_id).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.cold_meeting_outcomes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cold_lead_id  uuid NOT NULL REFERENCES public.cold_leads(id) ON DELETE CASCADE,
    note_id       uuid REFERENCES public.cold_lead_notes(id) ON DELETE CASCADE,
    outcome       text NOT NULL CHECK (outcome IN ('aconteceu', 'cancelada', 'no_show')),
    meeting_at    timestamptz,
    created_by    uuid,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 1 outcome por reuniao (nota). Indice parcial porque note_id e opcional.
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_outcome_note
    ON public.cold_meeting_outcomes(note_id) WHERE note_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_outcome_tenant ON public.cold_meeting_outcomes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meeting_outcome_lead ON public.cold_meeting_outcomes(cold_lead_id);

ALTER TABLE public.cold_meeting_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_outcomes_tenant_isolation" ON public.cold_meeting_outcomes;
CREATE POLICY "meeting_outcomes_tenant_isolation" ON public.cold_meeting_outcomes
    FOR ALL
    USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));
