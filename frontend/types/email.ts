// ============================================================
// Email Module Types
// ============================================================

// --- Email Account ---
export interface EmailAccount {
    id: string;
    tenant_id: string;
    name: string;
    provider: 'zoho' | 'gmail' | 'outlook' | 'generic';
    email: string;
    sender_name: string | null;
    auth_type: 'credentials' | 'oauth2';
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    imap_host: string | null;
    imap_port: number | null;
    imap_secure: boolean | null;
    username: string;
    // encrypted_password never returned to frontend
    signature_html: string | null;
    is_default: boolean;
    is_active: boolean;
    connection_status: EmailAccountConnectionStatus;
    last_connection_test_at: string | null;
    last_sync_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export type EmailAccountConnectionStatus =
    | 'active'
    | 'inactive'
    | 'invalid_credentials'
    | 'connection_error'
    | 'syncing'
    | 'needs_reauth';

export interface EmailAccountFormData {
    name: string;
    provider: string;
    email: string;
    sender_name: string;
    auth_type: string;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    imap_host: string;
    imap_port: number;
    imap_secure: boolean;
    username: string;
    password: string; // plaintext, encrypted before storage
    signature_html: string;
    is_default: boolean;
}

// --- Email Template ---
export interface EmailTemplate {
    id: string;
    tenant_id: string;
    name: string;
    slug: string | null;
    category: string;
    subject: string;
    body_html: string;
    body_text: string | null;
    variables_json: string[];
    visibility: 'private' | 'organization' | 'global';
    is_active: boolean;
    is_archived: boolean;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
}

// --- Email Message ---
export interface EmailMessage {
    id: string;
    tenant_id: string;
    account_id: string;
    lead_id: string | null;
    contact_id: string | null;
    opportunity_id: string | null;
    thread_id: string | null;
    external_message_id: string | null;
    direction: 'inbound' | 'outbound';
    message_type: 'manual' | 'automated' | 'reply' | 'forward' | 'draft';
    from_email: string;
    from_name: string | null;
    to_emails: string[];
    cc_emails: string[];
    bcc_emails: string[];
    reply_to_email: string | null;
    subject: string | null;
    body_html: string | null;
    body_text: string | null;
    preview_text: string | null;
    status: EmailMessageStatus;
    has_attachments: boolean;
    sent_at: string | null;
    received_at: string | null;
    failed_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    // Joined data
    email_accounts?: Pick<EmailAccount, 'name' | 'email'>;
}

export type EmailMessageStatus =
    | 'draft'
    | 'queued'
    | 'sending'
    | 'sent'
    | 'delivered'
    | 'failed'
    | 'received'
    | 'synced';

// --- Email Thread ---
export interface EmailThread {
    id: string;
    tenant_id: string;
    account_id: string;
    subject_normalized: string | null;
    primary_contact_id: string | null;
    primary_lead_id: string | null;
    primary_opportunity_id: string | null;
    last_message_at: string | null;
    message_count: number;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
    // Joined data
    email_messages?: EmailMessage[];
}

// --- Email Draft ---
export interface EmailDraft {
    id: string;
    tenant_id: string;
    account_id: string | null;
    lead_id: string | null;
    contact_id: string | null;
    opportunity_id: string | null;
    to_emails: string[];
    cc_emails: string[];
    bcc_emails: string[];
    subject: string | null;
    body_html: string | null;
    body_text: string | null;
    template_id: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

// --- Email Attachment ---
export interface EmailAttachment {
    id: string;
    tenant_id: string;
    message_id: string;
    storage_path: string | null;
    file_name: string;
    mime_type: string | null;
    file_size: number;
    content_id: string | null;
    is_inline: boolean;
    created_at: string;
}

// --- Email Log ---
export interface EmailLog {
    id: string;
    tenant_id: string;
    account_id: string | null;
    message_id: string | null;
    log_type: 'info' | 'warning' | 'error' | 'debug';
    operation: string;
    status: 'success' | 'failure' | 'pending';
    code: string | null;
    message: string | null;
    details_json: any;
    created_at: string;
}

// --- Composer Data ---
export interface EmailComposerData {
    account_id: string;
    to_emails: string[];
    cc_emails?: string[];
    bcc_emails?: string[];
    subject: string;
    body_html: string;
    body_text?: string;
    template_id?: string;
    lead_id?: string;
    contact_id?: string;
    opportunity_id?: string;
    in_reply_to?: string;
    thread_id?: string;
}
