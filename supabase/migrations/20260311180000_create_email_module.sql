-- ============================================================
-- EMAIL MODULE — Database Migration
-- ============================================================

-- 1. EMAIL ACCOUNTS
CREATE TABLE IF NOT EXISTS public.email_accounts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    provider text NOT NULL DEFAULT 'zoho',
    email text NOT NULL,
    sender_name text,
    auth_type text NOT NULL DEFAULT 'credentials',
    smtp_host text NOT NULL,
    smtp_port integer NOT NULL DEFAULT 587,
    smtp_secure boolean NOT NULL DEFAULT true,
    imap_host text,
    imap_port integer DEFAULT 993,
    imap_secure boolean DEFAULT true,
    username text NOT NULL,
    encrypted_password text,
    oauth_access_token text,
    oauth_refresh_token text,
    token_expires_at timestamp with time zone,
    signature_html text,
    is_default boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    connection_status text NOT NULL DEFAULT 'active',
    last_connection_test_at timestamp with time zone,
    last_sync_at timestamp with time zone,
    sync_cursor text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT email_accounts_pkey PRIMARY KEY (id),
    CONSTRAINT email_accounts_provider_check CHECK (provider IN ('zoho','gmail','outlook','generic')),
    CONSTRAINT email_accounts_auth_type_check CHECK (auth_type IN ('credentials','oauth2')),
    CONSTRAINT email_accounts_connection_status_check CHECK (connection_status IN ('active','inactive','invalid_credentials','connection_error','syncing','needs_reauth'))
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_tenant ON public.email_accounts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON public.email_accounts (email);

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

-- 2. EMAIL TEMPLATES
CREATE TABLE IF NOT EXISTS public.email_templates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    slug text,
    category text DEFAULT 'geral',
    subject text NOT NULL,
    body_html text NOT NULL,
    body_text text,
    variables_json jsonb DEFAULT '[]'::jsonb,
    visibility text NOT NULL DEFAULT 'organization',
    is_active boolean NOT NULL DEFAULT true,
    is_archived boolean NOT NULL DEFAULT false,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT email_templates_pkey PRIMARY KEY (id),
    CONSTRAINT email_templates_visibility_check CHECK (visibility IN ('private','organization','global'))
);

CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON public.email_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON public.email_templates (category);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- 3. EMAIL THREADS
CREATE TABLE IF NOT EXISTS public.email_threads (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    account_id uuid NOT NULL,
    subject_normalized text,
    primary_contact_id uuid,
    primary_lead_id uuid,
    primary_opportunity_id uuid,
    last_message_at timestamp with time zone,
    message_count integer NOT NULL DEFAULT 0,
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT email_threads_pkey PRIMARY KEY (id),
    CONSTRAINT email_threads_account_fkey FOREIGN KEY (account_id) REFERENCES public.email_accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_threads_tenant ON public.email_threads (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_account ON public.email_threads (account_id);

ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

-- 4. EMAIL MESSAGES
CREATE TABLE IF NOT EXISTS public.email_messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    account_id uuid NOT NULL,
    lead_id uuid,
    contact_id uuid,
    opportunity_id uuid,
    thread_id uuid,
    external_message_id text,
    external_thread_reference text,
    in_reply_to text,
    references_header text,
    direction text NOT NULL DEFAULT 'outbound',
    message_type text NOT NULL DEFAULT 'manual',
    from_email text NOT NULL,
    from_name text,
    to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
    cc_emails jsonb DEFAULT '[]'::jsonb,
    bcc_emails jsonb DEFAULT '[]'::jsonb,
    reply_to_email text,
    subject text,
    body_html text,
    body_text text,
    preview_text text,
    status text NOT NULL DEFAULT 'queued',
    provider_status text,
    provider_payload_json jsonb,
    has_attachments boolean NOT NULL DEFAULT false,
    sent_at timestamp with time zone,
    received_at timestamp with time zone,
    delivered_at timestamp with time zone,
    failed_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    replied_at timestamp with time zone,
    synced_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT email_messages_pkey PRIMARY KEY (id),
    CONSTRAINT email_messages_account_fkey FOREIGN KEY (account_id) REFERENCES public.email_accounts(id) ON DELETE CASCADE,
    CONSTRAINT email_messages_thread_fkey FOREIGN KEY (thread_id) REFERENCES public.email_threads(id) ON DELETE SET NULL,
    CONSTRAINT email_messages_direction_check CHECK (direction IN ('inbound','outbound')),
    CONSTRAINT email_messages_message_type_check CHECK (message_type IN ('manual','automated','reply','forward','draft')),
    CONSTRAINT email_messages_status_check CHECK (status IN ('draft','queued','sending','sent','delivered','failed','received','synced'))
);

CREATE INDEX IF NOT EXISTS idx_email_messages_tenant ON public.email_messages (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_account ON public.email_messages (account_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON public.email_messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_lead ON public.email_messages (lead_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_contact ON public.email_messages (contact_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_opportunity ON public.email_messages (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_external_id ON public.email_messages (external_message_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON public.email_messages (status);
CREATE INDEX IF NOT EXISTS idx_email_messages_direction ON public.email_messages (direction);
CREATE INDEX IF NOT EXISTS idx_email_messages_sent_at ON public.email_messages (sent_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_received_at ON public.email_messages (received_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_unique_external
    ON public.email_messages (tenant_id, account_id, external_message_id)
    WHERE external_message_id IS NOT NULL;

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

-- 5. EMAIL ATTACHMENTS
CREATE TABLE IF NOT EXISTS public.email_attachments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    message_id uuid NOT NULL,
    storage_path text,
    file_name text NOT NULL,
    mime_type text,
    file_size integer DEFAULT 0,
    content_id text,
    is_inline boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT email_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT email_attachments_message_fkey FOREIGN KEY (message_id) REFERENCES public.email_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_attachments_message ON public.email_attachments (message_id);

ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;

-- 6. EMAIL DRAFTS
CREATE TABLE IF NOT EXISTS public.email_drafts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    account_id uuid,
    lead_id uuid,
    contact_id uuid,
    opportunity_id uuid,
    to_emails jsonb DEFAULT '[]'::jsonb,
    cc_emails jsonb DEFAULT '[]'::jsonb,
    bcc_emails jsonb DEFAULT '[]'::jsonb,
    subject text,
    body_html text,
    body_text text,
    attachments_json jsonb DEFAULT '[]'::jsonb,
    template_id uuid,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT email_drafts_pkey PRIMARY KEY (id),
    CONSTRAINT email_drafts_account_fkey FOREIGN KEY (account_id) REFERENCES public.email_accounts(id) ON DELETE SET NULL,
    CONSTRAINT email_drafts_template_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_drafts_tenant ON public.email_drafts (tenant_id);

ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;

-- 7. EMAIL LOGS
CREATE TABLE IF NOT EXISTS public.email_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    account_id uuid,
    message_id uuid,
    log_type text NOT NULL DEFAULT 'info',
    operation text NOT NULL,
    status text NOT NULL DEFAULT 'success',
    code text,
    message text,
    details_json jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT email_logs_pkey PRIMARY KEY (id),
    CONSTRAINT email_logs_log_type_check CHECK (log_type IN ('info','warning','error','debug')),
    CONSTRAINT email_logs_status_check CHECK (status IN ('success','failure','pending'))
);

CREATE INDEX IF NOT EXISTS idx_email_logs_tenant ON public.email_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_account ON public.email_logs (account_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON public.email_logs (created_at DESC);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- 8. EMAIL TEMPLATE USAGE
CREATE TABLE IF NOT EXISTS public.email_template_usage (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    template_id uuid NOT NULL,
    message_id uuid,
    used_by uuid,
    used_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT email_template_usage_pkey PRIMARY KEY (id),
    CONSTRAINT email_template_usage_template_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id) ON DELETE CASCADE,
    CONSTRAINT email_template_usage_message_fkey FOREIGN KEY (message_id) REFERENCES public.email_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_template_usage_template ON public.email_template_usage (template_id);

ALTER TABLE public.email_template_usage ENABLE ROW LEVEL SECURITY;
