-- ============================================================
-- WEBINAR MODULE — Database Migration
-- ============================================================
-- Modulo de campanhas de webinar com prospeccao automatizada,
-- enriquecimento por IA, cadencia de mensagens e funil em tempo real.
-- ============================================================

-- 1. WEBINAR CAMPAIGNS
CREATE TABLE IF NOT EXISTS public.webinar_campaigns (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    owner_id uuid,

    name text NOT NULL,
    theme text,
    description text,

    event_date timestamptz,
    meet_link text,
    offer_description text,
    cal_link text,
    instance_name text,

    target_nicho text,
    target_cities text[],

    status text NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'scraping', 'enriching', 'ready', 'active', 'finished', 'archived'
    )),

    total_leads int NOT NULL DEFAULT 0,
    total_invited int NOT NULL DEFAULT 0,
    total_confirmed int NOT NULL DEFAULT 0,
    total_attended int NOT NULL DEFAULT 0,
    total_converted int NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT webinar_campaigns_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_webinar_campaigns_tenant ON public.webinar_campaigns (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webinar_campaigns_status ON public.webinar_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_webinar_campaigns_event_date ON public.webinar_campaigns (event_date);

ALTER TABLE public.webinar_campaigns ENABLE ROW LEVEL SECURITY;

-- 2. WEBINAR CAMPAIGN LEADS
CREATE TABLE IF NOT EXISTS public.webinar_campaign_leads (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL,
    cold_lead_id uuid,

    company_name text,
    phone text NOT NULL,
    website text,
    address text,
    rating numeric,
    reviews_count int DEFAULT 0,

    ai_score text CHECK (ai_score IN ('hot', 'warm', 'cold')),
    ai_angle text,
    ai_reasoning text,
    ai_enriched_at timestamptz,

    funnel_status text NOT NULL DEFAULT 'scraped' CHECK (funnel_status IN (
        'scraped', 'enriched', 'invited', 'viewed', 'replied',
        'confirmed', 'attended', 'no_show', 'converted', 'lost'
    )),

    meet_clicked_at timestamptz,
    attended_webinar boolean NOT NULL DEFAULT false,
    converted_to_call boolean NOT NULL DEFAULT false,
    call_scheduled_at timestamptz,

    notes text,
    loss_reason text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT webinar_campaign_leads_pkey PRIMARY KEY (id),
    CONSTRAINT webinar_campaign_leads_campaign_fk FOREIGN KEY (campaign_id)
        REFERENCES public.webinar_campaigns(id) ON DELETE CASCADE,
    CONSTRAINT webinar_campaign_leads_cold_lead_fk FOREIGN KEY (cold_lead_id)
        REFERENCES public.cold_leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wcl_campaign ON public.webinar_campaign_leads (campaign_id);
CREATE INDEX IF NOT EXISTS idx_wcl_funnel ON public.webinar_campaign_leads (funnel_status);
CREATE INDEX IF NOT EXISTS idx_wcl_phone ON public.webinar_campaign_leads (phone);
CREATE INDEX IF NOT EXISTS idx_wcl_cold_lead ON public.webinar_campaign_leads (cold_lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wcl_unique_campaign_phone
    ON public.webinar_campaign_leads (campaign_id, phone);

ALTER TABLE public.webinar_campaign_leads ENABLE ROW LEVEL SECURITY;

-- 3. WEBINAR CADENCE STEPS
CREATE TABLE IF NOT EXISTS public.webinar_cadence_steps (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL,

    name text,
    day_offset int NOT NULL,
    hour int NOT NULL DEFAULT 10 CHECK (hour >= 0 AND hour <= 23),
    minute int NOT NULL DEFAULT 0 CHECK (minute >= 0 AND minute <= 59),

    message_template text NOT NULL,
    trigger_status text,
    step_order int NOT NULL DEFAULT 0,

    enabled boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT webinar_cadence_steps_pkey PRIMARY KEY (id),
    CONSTRAINT webinar_cadence_steps_campaign_fk FOREIGN KEY (campaign_id)
        REFERENCES public.webinar_campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wcs_campaign ON public.webinar_cadence_steps (campaign_id);
CREATE INDEX IF NOT EXISTS idx_wcs_order ON public.webinar_cadence_steps (campaign_id, step_order);

ALTER TABLE public.webinar_cadence_steps ENABLE ROW LEVEL SECURITY;

-- 4. WEBINAR MESSAGES
CREATE TABLE IF NOT EXISTS public.webinar_messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    campaign_lead_id uuid NOT NULL,
    cadence_step_id uuid,

    scheduled_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'sent', 'delivered', 'read', 'replied', 'failed', 'cancelled'
    )),

    sent_text text,
    sent_at timestamptz,
    delivered_at timestamptz,
    read_at timestamptz,

    reply_text text,
    reply_at timestamptz,

    evolution_message_id text,
    error_message text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT webinar_messages_pkey PRIMARY KEY (id),
    CONSTRAINT webinar_messages_lead_fk FOREIGN KEY (campaign_lead_id)
        REFERENCES public.webinar_campaign_leads(id) ON DELETE CASCADE,
    CONSTRAINT webinar_messages_step_fk FOREIGN KEY (cadence_step_id)
        REFERENCES public.webinar_cadence_steps(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wm_lead ON public.webinar_messages (campaign_lead_id);
CREATE INDEX IF NOT EXISTS idx_wm_status ON public.webinar_messages (status);
CREATE INDEX IF NOT EXISTS idx_wm_scheduled ON public.webinar_messages (scheduled_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wm_evolution_id ON public.webinar_messages (evolution_message_id);

ALTER TABLE public.webinar_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TRIGGERS — updated_at automatico
-- ============================================================

CREATE OR REPLACE FUNCTION update_webinar_module_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_webinar_campaigns_updated_at ON public.webinar_campaigns;
CREATE TRIGGER trg_webinar_campaigns_updated_at
    BEFORE UPDATE ON public.webinar_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_webinar_module_updated_at();

DROP TRIGGER IF EXISTS trg_webinar_campaign_leads_updated_at ON public.webinar_campaign_leads;
CREATE TRIGGER trg_webinar_campaign_leads_updated_at
    BEFORE UPDATE ON public.webinar_campaign_leads
    FOR EACH ROW EXECUTE FUNCTION update_webinar_module_updated_at();

DROP TRIGGER IF EXISTS trg_webinar_cadence_steps_updated_at ON public.webinar_cadence_steps;
CREATE TRIGGER trg_webinar_cadence_steps_updated_at
    BEFORE UPDATE ON public.webinar_cadence_steps
    FOR EACH ROW EXECUTE FUNCTION update_webinar_module_updated_at();

DROP TRIGGER IF EXISTS trg_webinar_messages_updated_at ON public.webinar_messages;
CREATE TRIGGER trg_webinar_messages_updated_at
    BEFORE UPDATE ON public.webinar_messages
    FOR EACH ROW EXECUTE FUNCTION update_webinar_module_updated_at();

-- ============================================================
-- RLS POLICIES — basic tenant isolation
-- ============================================================

DROP POLICY IF EXISTS "tenant_isolation_select" ON public.webinar_campaigns;
CREATE POLICY "tenant_isolation_select" ON public.webinar_campaigns
    FOR SELECT USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "tenant_isolation_insert" ON public.webinar_campaigns;
CREATE POLICY "tenant_isolation_insert" ON public.webinar_campaigns
    FOR INSERT WITH CHECK (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "tenant_isolation_update" ON public.webinar_campaigns;
CREATE POLICY "tenant_isolation_update" ON public.webinar_campaigns
    FOR UPDATE USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "tenant_isolation_delete" ON public.webinar_campaigns;
CREATE POLICY "tenant_isolation_delete" ON public.webinar_campaigns
    FOR DELETE USING (tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    ));

-- Para tabelas filhas, RLS via FK de campaign_id

DROP POLICY IF EXISTS "via_campaign_select" ON public.webinar_campaign_leads;
CREATE POLICY "via_campaign_select" ON public.webinar_campaign_leads
    FOR SELECT USING (campaign_id IN (SELECT id FROM public.webinar_campaigns));

DROP POLICY IF EXISTS "via_campaign_all" ON public.webinar_campaign_leads;
CREATE POLICY "via_campaign_all" ON public.webinar_campaign_leads
    FOR ALL USING (campaign_id IN (SELECT id FROM public.webinar_campaigns));

DROP POLICY IF EXISTS "via_campaign_select" ON public.webinar_cadence_steps;
CREATE POLICY "via_campaign_select" ON public.webinar_cadence_steps
    FOR SELECT USING (campaign_id IN (SELECT id FROM public.webinar_campaigns));

DROP POLICY IF EXISTS "via_campaign_all" ON public.webinar_cadence_steps;
CREATE POLICY "via_campaign_all" ON public.webinar_cadence_steps
    FOR ALL USING (campaign_id IN (SELECT id FROM public.webinar_campaigns));

DROP POLICY IF EXISTS "via_lead_select" ON public.webinar_messages;
CREATE POLICY "via_lead_select" ON public.webinar_messages
    FOR SELECT USING (campaign_lead_id IN (SELECT id FROM public.webinar_campaign_leads));

DROP POLICY IF EXISTS "via_lead_all" ON public.webinar_messages;
CREATE POLICY "via_lead_all" ON public.webinar_messages
    FOR ALL USING (campaign_lead_id IN (SELECT id FROM public.webinar_campaign_leads));

-- ============================================================
-- COMMENTS — documentacao das tabelas
-- ============================================================

COMMENT ON TABLE public.webinar_campaigns IS 'Campanhas de webinar (eventos com cadencia automatizada e prospeccao).';
COMMENT ON TABLE public.webinar_campaign_leads IS 'Leads associados a uma campanha de webinar (snapshot por campanha, opcionalmente linkado a cold_leads).';
COMMENT ON TABLE public.webinar_cadence_steps IS 'Templates de mensagens da cadencia (D-7, D-3, D-1, D-0, D+1) por campanha.';
COMMENT ON TABLE public.webinar_messages IS 'Mensagens agendadas/enviadas por lead da campanha. Cron processa pending pra enviar via Evolution.';
