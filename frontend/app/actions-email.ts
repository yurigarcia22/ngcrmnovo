"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/lib/encryption";
import { renderTemplate, extractVariables } from "@/lib/email-template-renderer";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getTenantId } from "./actions";

// --- Helper: get admin Supabase client ---
function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// --- Helper: get current user id ---
async function getCurrentUserId(): Promise<string | null> {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll(cookiesToSet) {
                    try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { }
                },
            },
        }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
}

// ============================================================
// EMAIL ACCOUNTS
// ============================================================

export async function getEmailAccounts() {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        const { data, error } = await supabase
            .from("email_accounts")
            .select("id, tenant_id, name, provider, email, sender_name, auth_type, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, signature_html, is_default, is_active, connection_status, last_connection_test_at, last_sync_at, created_by, created_at, updated_at")
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getEmailAccounts Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createEmailAccount(formData: {
    name: string;
    provider: string;
    email: string;
    sender_name: string;
    auth_type: string;
    smtp_host: string;
    smtp_port: number;
    smtp_secure: boolean;
    imap_host?: string;
    imap_port?: number;
    imap_secure?: boolean;
    username: string;
    password: string;
    signature_html?: string;
    is_default?: boolean;
}) {
    try {
        const tenantId = await getTenantId();
        const userId = await getCurrentUserId();
        const supabase = getAdminClient();

        // Encrypt the password
        const encryptedPassword = encrypt(formData.password);

        // If setting as default, unset other defaults
        if (formData.is_default) {
            await supabase
                .from("email_accounts")
                .update({ is_default: false })
                .eq("tenant_id", tenantId);
        }

        const { data, error } = await supabase
            .from("email_accounts")
            .insert({
                tenant_id: tenantId,
                name: formData.name,
                provider: formData.provider,
                email: formData.email,
                sender_name: formData.sender_name,
                auth_type: formData.auth_type,
                smtp_host: formData.smtp_host,
                smtp_port: formData.smtp_port,
                smtp_secure: formData.smtp_secure,
                imap_host: formData.imap_host || null,
                imap_port: formData.imap_port || null,
                imap_secure: formData.imap_secure ?? null,
                username: formData.username,
                encrypted_password: encryptedPassword,
                signature_html: formData.signature_html || null,
                is_default: formData.is_default || false,
                created_by: userId,
            })
            .select()
            .single();

        if (error) throw error;

        // Log the creation
        await createEmailLog(tenantId, data.id, null, 'info', 'account_created', 'success', null, 'Conta de e-mail criada com sucesso.');

        return { success: true, data };
    } catch (error: any) {
        console.error("createEmailAccount Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateEmailAccount(id: string, formData: {
    name?: string;
    provider?: string;
    email?: string;
    sender_name?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_secure?: boolean;
    imap_host?: string;
    imap_port?: number;
    imap_secure?: boolean;
    username?: string;
    password?: string;
    signature_html?: string;
    is_default?: boolean;
    is_active?: boolean;
}) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        const updateData: any = { ...formData, updated_at: new Date().toISOString() };

        // Re-encrypt if password changed
        if (formData.password) {
            updateData.encrypted_password = encrypt(formData.password);
            delete updateData.password;
        } else {
            delete updateData.password;
        }

        // If setting as default, unset others
        if (formData.is_default) {
            await supabase
                .from("email_accounts")
                .update({ is_default: false })
                .eq("tenant_id", tenantId)
                .neq("id", id);
        }

        const { data, error } = await supabase
            .from("email_accounts")
            .update(updateData)
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("updateEmailAccount Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteEmailAccount(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        const { error } = await supabase
            .from("email_accounts")
            .update({ deleted_at: new Date().toISOString(), is_active: false })
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("deleteEmailAccount Error:", error);
        return { success: false, error: error.message };
    }
}

export async function testEmailConnection(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        // Fetch account with encrypted password
        const { data: account, error: fetchError } = await supabase
            .from("email_accounts")
            .select("*")
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .single();

        if (fetchError || !account) throw new Error("Conta não encontrada.");

        // Decrypt password
        let password: string;
        try {
            password = decrypt(account.encrypted_password);
        } catch {
            await supabase.from("email_accounts").update({ connection_status: 'invalid_credentials', last_connection_test_at: new Date().toISOString() }).eq("id", id);
            await createEmailLog(tenantId, id, null, 'error', 'connection_test', 'failure', 'DECRYPT_FAIL', 'Falha ao descriptografar senha.');
            return { success: false, error: "Falha ao descriptografar credenciais." };
        }

        // Test SMTP connection
        const useSecure = account.smtp_port === 465;
        const transporter = nodemailer.createTransport({
            host: account.smtp_host,
            port: account.smtp_port,
            secure: useSecure,
            auth: {
                user: account.username,
                pass: password,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            tls: {
                rejectUnauthorized: false,
            },
        });

        try {
            await transporter.verify();
        } catch (smtpError: any) {
            const errorCode = smtpError.code || 'SMTP_ERROR';
            const errorMsg = smtpError.message || 'Erro de conexão SMTP';
            await createEmailLog(tenantId, id, null, 'error', 'connection_test', 'failure', errorCode, `SMTP: ${errorMsg}`);
            return { success: false, error: `SMTP: ${errorMsg}` };
        } finally {
            transporter.close();
        }

        // Test IMAP connection
        if (account.imap_host && account.imap_port) {
            const imapClient = new ImapFlow({
                host: account.imap_host,
                port: account.imap_port,
                secure: account.imap_secure,
                auth: {
                    user: account.username,
                    pass: password,
                },
                logger: false,
                clientInfo: {
                    name: 'CRM-NG',
                    version: '1.0.0'
                },
                connectionTimeout: 15000,
                tls: { rejectUnauthorized: false },
            } as any);

            try {
                await imapClient.connect();
                await imapClient.logout();
            } catch (imapError: any) {
                const errorMsg = imapError.message || 'Erro de conexão IMAP';
                console.error("IMAP Test Error:", imapError);
                await createEmailLog(tenantId, id, null, 'error', 'connection_test', 'failure', imapError.code || 'IMAP_ERROR', `IMAP: ${errorMsg}`, {
                    stack: imapError.stack,
                    code: imapError.code,
                    response: imapError.response
                });
                return { success: false, error: `SMTP OK, mas IMAP falhou: ${errorMsg}` };
            }
        }

        await supabase.from("email_accounts").update({
            connection_status: 'active',
            last_connection_test_at: new Date().toISOString(),
        }).eq("id", id);

        await createEmailLog(tenantId, id, null, 'info', 'connection_test', 'success', null, 'Conexão SMTP e IMAP verificadas com sucesso.');

        return { success: true, message: "Conexão SMTP e IMAP verificadas com sucesso!" };
    } catch (error: any) {
        console.error("testEmailConnection Error:", error);
        return { success: false, error: error.message };
    }
}

export async function setDefaultEmailAccount(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        // Unset all defaults
        await supabase.from("email_accounts").update({ is_default: false }).eq("tenant_id", tenantId);

        // Set this one as default
        const { error } = await supabase
            .from("email_accounts")
            .update({ is_default: true })
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("setDefaultEmailAccount Error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// EMAIL TEMPLATES
// ============================================================

export async function getEmailTemplates(filters?: { search?: string; category?: string }) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        let query = supabase
            .from("email_templates")
            .select("*")
            .eq("tenant_id", tenantId)
            .is("deleted_at", null)
            .eq("is_archived", false);

        if (filters?.category) query = query.eq("category", filters.category);
        if (filters?.search) query = query.or(`name.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`);

        query = query.order("created_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getEmailTemplates Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createEmailTemplate(formData: {
    name: string;
    category?: string;
    subject: string;
    body_html: string;
    body_text?: string;
    visibility?: string;
}) {
    try {
        const tenantId = await getTenantId();
        const userId = await getCurrentUserId();
        const supabase = getAdminClient();

        const variables = extractVariables(formData.body_html + ' ' + formData.subject);

        const { data, error } = await supabase
            .from("email_templates")
            .insert({
                tenant_id: tenantId,
                name: formData.name,
                slug: formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                category: formData.category || 'geral',
                subject: formData.subject,
                body_html: formData.body_html,
                body_text: formData.body_text || null,
                variables_json: variables,
                visibility: formData.visibility || 'organization',
                created_by: userId,
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("createEmailTemplate Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateEmailTemplate(id: string, formData: {
    name?: string;
    category?: string;
    subject?: string;
    body_html?: string;
    body_text?: string;
    visibility?: string;
}) {
    try {
        const tenantId = await getTenantId();
        const userId = await getCurrentUserId();
        const supabase = getAdminClient();

        const updateData: any = { ...formData, updated_by: userId, updated_at: new Date().toISOString() };

        if (formData.body_html || formData.subject) {
            const content = (formData.body_html || '') + ' ' + (formData.subject || '');
            updateData.variables_json = extractVariables(content);
        }

        if (formData.name) {
            updateData.slug = formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        }

        const { data, error } = await supabase
            .from("email_templates")
            .update(updateData)
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("updateEmailTemplate Error:", error);
        return { success: false, error: error.message };
    }
}

export async function duplicateEmailTemplate(id: string) {
    try {
        const tenantId = await getTenantId();
        const userId = await getCurrentUserId();
        const supabase = getAdminClient();

        const { data: original, error: fetchError } = await supabase
            .from("email_templates")
            .select("*")
            .eq("id", id)
            .eq("tenant_id", tenantId)
            .single();

        if (fetchError || !original) throw new Error("Template não encontrado.");

        const { data, error } = await supabase
            .from("email_templates")
            .insert({
                tenant_id: tenantId,
                name: `${original.name} (Cópia)`,
                slug: `${original.slug}-copia-${Date.now()}`,
                category: original.category,
                subject: original.subject,
                body_html: original.body_html,
                body_text: original.body_text,
                variables_json: original.variables_json,
                visibility: original.visibility,
                created_by: userId,
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("duplicateEmailTemplate Error:", error);
        return { success: false, error: error.message };
    }
}

export async function archiveEmailTemplate(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        const { error } = await supabase
            .from("email_templates")
            .update({ is_archived: true, updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteEmailTemplate(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        const { error } = await supabase
            .from("email_templates")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

// ============================================================
// EMAIL SENDING
// ============================================================

export async function sendEmail(composerData: {
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
}) {
    try {
        const tenantId = await getTenantId();
        const userId = await getCurrentUserId();
        const supabase = getAdminClient();

        // Validate
        if (!composerData.to_emails || composerData.to_emails.length === 0) {
            return { success: false, error: "Destinatário obrigatório." };
        }
        if (!composerData.subject?.trim()) {
            return { success: false, error: "Assunto obrigatório." };
        }

        // Get account  
        const { data: account, error: accError } = await supabase
            .from("email_accounts")
            .select("*")
            .eq("id", composerData.account_id)
            .eq("tenant_id", tenantId)
            .single();

        if (accError || !account) return { success: false, error: "Conta de e-mail não encontrada." };
        if (!account.is_active) return { success: false, error: "Conta de e-mail desativada." };

        // Decrypt password
        const password = decrypt(account.encrypted_password);

        // Create transporter
        // Port 465 = direct SSL (secure: true)
        // Port 587 = STARTTLS (secure: false, TLS upgraded after connect)
        const useSecure = account.smtp_port === 465;
        const transporter = nodemailer.createTransport({
            host: account.smtp_host,
            port: account.smtp_port,
            secure: useSecure,
            auth: {
                user: account.username,
                pass: password,
            },
            tls: {
                rejectUnauthorized: false,
            },
        });

        // Build message
        const mailOptions: any = {
            from: `"${account.sender_name || account.name}" <${account.email}>`,
            to: composerData.to_emails.join(', '),
            subject: composerData.subject,
            html: composerData.body_html + (account.signature_html ? `<br/><br/>${account.signature_html}` : ''),
            text: composerData.body_text || undefined,
        };

        if (composerData.cc_emails?.length) mailOptions.cc = composerData.cc_emails.join(', ');
        if (composerData.bcc_emails?.length) mailOptions.bcc = composerData.bcc_emails.join(', ');
        if (composerData.in_reply_to) mailOptions.inReplyTo = composerData.in_reply_to;

        // Create message record with status 'sending'
        const { data: message, error: msgError } = await supabase
            .from("email_messages")
            .insert({
                tenant_id: tenantId,
                account_id: composerData.account_id,
                lead_id: composerData.lead_id || null,
                contact_id: composerData.contact_id || null,
                opportunity_id: composerData.opportunity_id || null,
                thread_id: composerData.thread_id || null,
                direction: 'outbound',
                message_type: composerData.in_reply_to ? 'reply' : 'manual',
                from_email: account.email,
                from_name: account.sender_name || account.name,
                to_emails: composerData.to_emails,
                cc_emails: composerData.cc_emails || [],
                bcc_emails: composerData.bcc_emails || [],
                subject: composerData.subject,
                body_html: composerData.body_html,
                body_text: composerData.body_text || null,
                preview_text: (composerData.body_text || composerData.body_html?.replace(/<[^>]*>/g, '') || '').substring(0, 200),
                status: 'sending',
                in_reply_to: composerData.in_reply_to || null,
                created_by: userId,
            })
            .select()
            .single();

        if (msgError) throw msgError;

        // Send via SMTP
        try {
            const info = await transporter.sendMail(mailOptions);

            // Update message as sent
            await supabase.from("email_messages").update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                external_message_id: info.messageId,
                provider_payload_json: { response: info.response, messageId: info.messageId },
            }).eq("id", message.id);

            await createEmailLog(tenantId, composerData.account_id, message.id, 'info', 'send_email', 'success', null, `E-mail enviado para ${composerData.to_emails.join(', ')}`);

            // Track template usage
            if (composerData.template_id) {
                await supabase.from("email_template_usage").insert({
                    tenant_id: tenantId,
                    template_id: composerData.template_id,
                    message_id: message.id,
                    used_by: userId,
                });
            }

            return { success: true, data: { ...message, status: 'sent' } };
        } catch (sendError: any) {
            // Update message as failed
            await supabase.from("email_messages").update({
                status: 'failed',
                failed_at: new Date().toISOString(),
                provider_payload_json: { error: sendError.message },
            }).eq("id", message.id);

            await createEmailLog(tenantId, composerData.account_id, message.id, 'error', 'send_email', 'failure', sendError.code || 'SMTP_ERROR', sendError.message);

            return { success: false, error: `Falha no envio: ${sendError.message}` };
        } finally {
            transporter.close();
        }
    } catch (error: any) {
        console.error("sendEmail Error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// EMAIL MESSAGES — QUERY
// ============================================================

export async function syncEmailInbox(accountId?: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        // Get accounts to sync
        let query = supabase
            .from("email_accounts")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("is_active", true)
            .is("deleted_at", null);

        if (accountId) query = query.eq("id", accountId);

        const { data: accounts, error: accError } = await query;
        if (accError || !accounts || accounts.length === 0) {
            return { success: false, error: "Nenhuma conta ativa encontrada." };
        }

        let totalNew = 0;
        const errors: string[] = [];

        for (const account of accounts) {
            if (!account.imap_host || !account.imap_port) {
                errors.push(`${account.name}: IMAP não configurado.`);
                continue;
            }

            let password: string;
            try {
                password = decrypt(account.encrypted_password);
            } catch {
                errors.push(`${account.name}: Falha ao descriptografar credenciais.`);
                continue;
            }

            const client = new ImapFlow({
                host: account.imap_host,
                port: account.imap_port,
                secure: account.imap_secure,
                auth: {
                    user: account.username,
                    pass: password,
                },
                logger: false,
                clientInfo: {
                    name: 'CRM-NG',
                    version: '1.0.0'
                },
                connectionTimeout: 30000,
                tls: {
                    rejectUnauthorized: false,
                },
            } as any);

            try {
                await client.connect();

                const lock = await client.getMailboxLock('INBOX');
                try {
                    const mailbox = client.mailbox;
                    if (!mailbox || !mailbox.exists || mailbox.exists === 0) {
                        // lock.release() is handled by finally block
                        continue;
                    }

                    // Fetch last 30 messages using range to find recent messages
                    const totalMessages = mailbox.exists;
                    const startSeq = Math.max(1, totalMessages - 29);
                    const range = `${startSeq}:*`;

                    const messages: any[] = [];
                    // Using fetch to get envelopes and UIDs
                    for await (const msg of client.fetch(range, {
                        envelope: true,
                        uid: true,
                    })) {
                        messages.push(msg);
                    }

                    // Process messages in reverse (newest first)
                    messages.reverse();

                    for (const msg of messages) {
                        try {
                            const messageId = msg.envelope?.messageId || `imap-${account.id}-${msg.uid}`;

                            // Check if already exists before downloading source
                            const { data: existing } = await supabase
                                .from("email_messages")
                                .select("id")
                                .eq("tenant_id", tenantId)
                                .eq("external_message_id", messageId)
                                .maybeSingle();

                            if (existing) continue;

                            // Download full source using UID instead of sequence number
                            let source;
                            try {
                                const fullMsg: any = await client.fetchOne(`${msg.uid}`, { source: true }, { uid: true });
                                if (fullMsg && fullMsg.source) {
                                    source = fullMsg.source;
                                }
                            } catch (fetchErr: any) {
                                console.error(`Failed to fetch source for UID ${msg.uid}:`, fetchErr.message);
                                continue;
                            }

                            if (!source) continue;

                            const parsed: any = await simpleParser(source as Buffer);

                            const fromAddr = parsed.from?.value?.[0];
                            const toAddrs = parsed.to
                                ? (Array.isArray(parsed.to)
                                    ? parsed.to.flatMap((t: any) => t.value.map((v: any) => v.address || ''))
                                    : parsed.to.value.map((v: any) => v.address || ''))
                                : [];

                            const bodyHtml = parsed.html || undefined;
                            const bodyText = parsed.text || undefined;
                            const previewText = (bodyText || (typeof bodyHtml === 'string' ? bodyHtml.replace(/<[^>]*>/g, '') : '') || '').substring(0, 200);

                            await supabase.from("email_messages").insert({
                                tenant_id: tenantId,
                                account_id: account.id,
                                external_message_id: messageId,
                                direction: 'inbound',
                                message_type: parsed.inReplyTo ? 'reply' : 'manual',
                                from_email: fromAddr?.address || '',
                                from_name: fromAddr?.name || fromAddr?.address || '',
                                to_emails: toAddrs.filter(Boolean),
                                cc_emails: [],
                                bcc_emails: [],
                                subject: parsed.subject || '(Sem assunto)',
                                body_html: typeof bodyHtml === 'string' ? bodyHtml : null,
                                body_text: bodyText || null,
                                preview_text: previewText,
                                status: 'received',
                                has_attachments: (parsed.attachments?.length || 0) > 0,
                                received_at: parsed.date?.toISOString() || new Date().toISOString(),
                                in_reply_to: parsed.inReplyTo || null,
                            });

                            totalNew++;
                        } catch (parseErr: any) {
                            console.error(`Error processing message UID ${msg.uid}:`, parseErr.message);
                        }
                    }
                } finally {
                    lock.release();
                }

                // Update last sync time
                await supabase.from("email_accounts").update({
                    last_sync_at: new Date().toISOString(),
                    connection_status: 'active',
                }).eq("id", account.id);

                await createEmailLog(tenantId, account.id, null, 'info', 'imap_sync', 'success', null, `Sincronizados ${totalNew} novos e-mails.`);

            } catch (imapError: any) {
                const errorMsg = imapError.message || "Unknown IMAP error";
                console.error(`IMAP sync error for ${account.name}:`, errorMsg);
                errors.push(`${account.name}: ${errorMsg}`);
                await createEmailLog(tenantId, account.id, null, 'error', 'imap_sync', 'failure', 'IMAP_ERROR', errorMsg);
            } finally {
                try { await client.logout(); } catch { }
            }
        }

        return {
            success: true,
            data: { totalNew, errors },
            message: totalNew > 0 ? `${totalNew} novo(s) e-mail(s) sincronizado(s)!` : 'Nenhum e-mail novo encontrado.',
        };
    } catch (error: any) {
        console.error("syncEmailInbox Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getEmailInbox(filters?: { account_id?: string; search?: string; page?: number; limit?: number }) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();
        const limit = filters?.limit || 50;
        const offset = ((filters?.page || 1) - 1) * limit;

        let query = supabase
            .from("email_messages")
            .select("*, email_accounts(name, email)")
            .eq("tenant_id", tenantId)
            .eq("direction", "inbound")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (filters?.account_id) query = query.eq("account_id", filters.account_id);
        if (filters?.search) query = query.or(`subject.ilike.%${filters.search}%,from_email.ilike.%${filters.search}%`);

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getEmailInbox Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getEmailSent(filters?: { account_id?: string; search?: string; page?: number; limit?: number }) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();
        const limit = filters?.limit || 50;
        const offset = ((filters?.page || 1) - 1) * limit;

        let query = supabase
            .from("email_messages")
            .select("*, email_accounts(name, email)")
            .eq("tenant_id", tenantId)
            .eq("direction", "outbound")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (filters?.account_id) query = query.eq("account_id", filters.account_id);
        if (filters?.search) query = query.or(`subject.ilike.%${filters.search}%,to_emails.cs.{${filters.search}}`);

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getEmailSent Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteEmailMessage(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        const { error } = await supabase
            .from("email_messages")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        console.error("deleteEmailMessage Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getEmailThread(threadId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        const { data: thread, error: threadError } = await supabase
            .from("email_threads")
            .select("*")
            .eq("id", threadId)
            .eq("tenant_id", tenantId)
            .single();

        if (threadError) throw threadError;

        const { data: messages, error: messagesError } = await supabase
            .from("email_messages")
            .select("*, email_accounts(name, email)")
            .eq("thread_id", threadId)
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: true });

        if (messagesError) throw messagesError;

        return { success: true, data: { ...thread, email_messages: messages } };
    } catch (error: any) {
        console.error("getEmailThread Error:", error);
        return { success: false, error: error.message };
    }
}

export async function getEmailsByEntity(entityType: 'lead' | 'contact' | 'opportunity', entityId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();

        const columnMap = {
            lead: 'lead_id',
            contact: 'contact_id',
            opportunity: 'opportunity_id',
        };

        const { data, error } = await supabase
            .from("email_messages")
            .select("*, email_accounts(name, email)")
            .eq("tenant_id", tenantId)
            .eq(columnMap[entityType], entityId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getEmailsByEntity Error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================
// EMAIL LOGS
// ============================================================

export async function createEmailLog(
    tenantId: string,
    accountId: string | null,
    messageId: string | null,
    logType: 'info' | 'warning' | 'error' | 'debug',
    operation: string,
    status: 'success' | 'failure' | 'pending',
    code: string | null,
    message: string,
    detailsJson?: any
) {
    try {
        const supabase = getAdminClient();
        await supabase.from("email_logs").insert({
            tenant_id: tenantId,
            account_id: accountId,
            message_id: messageId,
            log_type: logType,
            operation,
            status,
            code,
            message,
            details_json: detailsJson || null,
        });
    } catch (error) {
        console.error("createEmailLog Error:", error);
    }
}

export async function getEmailLogs(filters?: { account_id?: string; log_type?: string; page?: number; limit?: number }) {
    try {
        const tenantId = await getTenantId();
        const supabase = getAdminClient();
        const limit = filters?.limit || 100;
        const offset = ((filters?.page || 1) - 1) * limit;

        let query = supabase
            .from("email_logs")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (filters?.account_id) query = query.eq("account_id", filters.account_id);
        if (filters?.log_type) query = query.eq("log_type", filters.log_type);

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, data };
    } catch (error: any) {
        console.error("getEmailLogs Error:", error);
        return { success: false, error: error.message };
    }
}
