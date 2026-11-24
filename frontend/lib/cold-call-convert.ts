import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeToCanonical, getPossibleVariants } from '@/lib/phone';

/**
 * Garante uma venda (deal) aberta para o cold lead no funil de vendas padrao.
 *
 * O caminho normal e o trigger do banco (trg_cold_lead_zconvert), que converte quando o
 * lead entra numa etapa is_won e grava cold_leads.converted_deal_id. Esta funcao e a
 * reserva para funis sem etapa de ganho equivalente (ex: reuniao marcada num funil
 * cuja coluna "Confirmado" nao e is_won). Idempotente: reaproveita deal aberto do contato.
 */
export async function ensureDealForColdLead(
    admin: SupabaseClient,
    tenantId: string,
    lead: { id: string; nome?: string | null; telefone?: string | null; email?: string | null; custom_fields?: any; responsavel_id?: string | null; converted_deal_id?: string | null },
    fallbackOwnerId: string | null,
): Promise<string | null> {
    try {
        if (lead.converted_deal_id) {
            const { data: d } = await admin.from('deals').select('id').eq('id', lead.converted_deal_id).eq('status', 'open').maybeSingle();
            if (d?.id) return d.id as string;
        }

        const canonical = normalizeToCanonical(lead.telefone || '');
        if (canonical.length < 12) return null;

        // 1. Contato (acha por qualquer variante do telefone ou cria)
        let contactId: string;
        const { data: existing } = await admin
            .from('contacts').select('id, phone').eq('tenant_id', tenantId).in('phone', getPossibleVariants(canonical));
        if (existing && existing.length > 0) {
            contactId = (existing.find((c: any) => c.phone === canonical) ?? existing[0]).id;
        } else {
            const { data: nc, error } = await admin
                .from('contacts')
                .insert({ name: lead.nome?.trim() || canonical, phone: canonical, email: lead.email || null, tenant_id: tenantId, photo_url: '' })
                .select('id').single();
            if (error || !nc) return null;
            contactId = nc.id;
        }

        // 2. Reaproveita deal aberto do contato
        const { data: openDeal } = await admin
            .from('deals').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId).eq('status', 'open')
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        let dealId: string | null = openDeal?.id ?? null;

        if (!dealId) {
            // 3. Etapa de entrada do funil de vendas padrao (a RPC ja filtra kind='deals')
            const { data: stageId } = await admin.rpc('get_tenant_inbox_stage', { p_tenant_id: tenantId });
            if (stageId == null) return null;

            const customValues: any = {};
            if (lead.custom_fields?.decisor_nome) customValues.responsible_name = lead.custom_fields.decisor_nome;
            if (lead.custom_fields?.decisor_telefone) customValues.responsible_direct_phone = lead.custom_fields.decisor_telefone;

            const { data: newDeal, error: dErr } = await admin
                .from('deals')
                .insert({
                    title: lead.nome?.trim() || canonical,
                    value: 0,
                    contact_id: contactId,
                    stage_id: stageId,
                    status: 'open',
                    tenant_id: tenantId,
                    owner_id: lead.responsavel_id ?? fallbackOwnerId,
                    custom_values: Object.keys(customValues).length ? customValues : null,
                })
                .select('id').single();
            if (dErr || !newDeal) return null;
            dealId = newDeal.id as string;

            // 4. Replica o historico (cold_lead_notes -> notes do deal)
            const { data: leadNotes } = await admin
                .from('cold_lead_notes').select('content, created_at').eq('cold_lead_id', lead.id)
                .order('created_at', { ascending: true });
            if (leadNotes && leadNotes.length > 0) {
                const { error: nErr } = await admin.from('notes').insert(leadNotes.map((n: any) => ({
                    deal_id: dealId,
                    content: `[Histórico Cold Call]: ${n.content}`,
                    tenant_id: tenantId,
                    created_at: n.created_at,
                })));
                if (nErr) console.error('Replicar notas cold lead:', nErr);
            }
        }

        await admin.from('cold_leads').update({ converted_deal_id: dealId }).eq('id', lead.id).eq('tenant_id', tenantId);
        return dealId;
    } catch (e) {
        console.error('ensureDealForColdLead Error:', e);
        return null;
    }
}
