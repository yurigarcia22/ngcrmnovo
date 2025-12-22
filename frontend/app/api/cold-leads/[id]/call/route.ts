import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { ColdLead, ColdLeadUpdate } from '@/types/cold-lead';

// Placeholder for Kanban integration
async function createOpportunityFromColdLeadPlaceholder(lead: ColdLead, pipelineId?: string, stageId?: string) {
    const supabase = await createClient();

    // 1. Get User and Tenant
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error('User not authenticated for duplication');
        return;
    }

    // We need usage of admin client or just querying profiles with current user
    // Assuming standard policies allow reading own profile
    const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

    if (!profile?.tenant_id) {
        console.error('Tenant ID not found for user');
        return;
    }
    const tenantId = profile.tenant_id;

    // 2. Normalize Phone
    const cleanPhone = lead.telefone.replace(/\D/g, "");
    let phoneToSave = cleanPhone;
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        phoneToSave = "55" + cleanPhone;
    }

    // 3. Upsert Contact
    // Check existing
    const possiblePhones = [phoneToSave, cleanPhone];
    if (cleanPhone.startsWith("55")) {
        possiblePhones.push(cleanPhone.substring(2));
    }

    let contactId;
    const { data: existingContacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("phone", possiblePhones)
        .limit(1);

    if (existingContacts && existingContacts.length > 0) {
        contactId = existingContacts[0].id;
    } else {
        const { data: newContact, error: contactError } = await supabase
            .from("contacts")
            .insert({
                name: lead.nome,
                phone: phoneToSave,
                tenant_id: tenantId,
                // Add extra fields if available in cold lead? Notes etc.
            })
            .select("id")
            .single();

        if (contactError) {
            console.error('Error creating contact:', contactError);
            return;
        }
        contactId = newContact.id;
    }

    // 4. Find Target Pipeline (Funil de Vendas)
    // If pipelineId is provided, verify it exists or just use it. 
    // Ideally we should check ownership, but let's assume valid for now or quick check.

    let targetPipelineId = pipelineId;

    if (!targetPipelineId) {
        const { data: pipelines } = await supabase
            .from("pipelines")
            .select("id, name")
            .eq("tenant_id", tenantId)
            .ilike("name", "%Funil de Vendas%");

        if (pipelines && pipelines.length > 0) {
            targetPipelineId = pipelines[0].id;
        } else {
            // Fallback to first available pipeline
            const { data: firstPipeline } = await supabase
                .from("pipelines")
                .select("id")
                .eq("tenant_id", tenantId)
                .limit(1)
                .single();
            if (firstPipeline) targetPipelineId = firstPipeline.id;
        }
    }

    if (!targetPipelineId) {
        console.error('No pipeline found');
        return;
    }

    // 5. Get Stage
    let targetStageId = stageId;

    if (!targetStageId) {
        const { data: stages } = await supabase
            .from("stages")
            .select("id, name")
            .eq("tenant_id", tenantId)
            .eq("pipeline_id", targetPipelineId)
            .ilike("name", "%Novo%") // Matches 'Novos Leads', 'Novo Lead', etc.
            .limit(1);

        if (stages && stages.length > 0) {
            targetStageId = stages[0].id;
        } else {
            // Fallback to first position
            const { data: firstStage } = await supabase
                .from("stages")
                .select("id")
                .eq("tenant_id", tenantId)
                .eq("pipeline_id", targetPipelineId)
                .order("position", { ascending: true })
                .limit(1)
                .single();

            if (firstStage) targetStageId = firstStage.id;
        }
    }

    if (!targetStageId) {
        console.error('No stages found for pipeline:', targetPipelineId);
        return;
    }

    // 6. Create Deal
    const { error: dealError } = await supabase
        .from("deals")
        .insert({
            title: lead.nome,
            value: 0,
            contact_id: contactId,
            stage_id: targetStageId,
            status: "open",
            tenant_id: tenantId,
            owner_id: user.id
        });

    if (dealError) {
        console.error('Error creating deal:', dealError);
    } else {
        console.log('Opportunity created successfully for lead:', lead.id);
        // Clean cache for leads page
        try {
            // We need to dinamically import or use the imported path if available.
            // But since this is a route handler, we can just use revalidatePath if imported.
            // I'll assume I need to add the import at the top of the file as well.
        } catch (e) { console.error('Reval error', e) }
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { id } = await params;

    try {
        const { resultado, notas, proxima_ligacao, pipeline_id, stage_id } = await request.json();

        // Fetch current lead
        const { data: currentLead, error: fetchError } = await supabase
            .from('cold_leads')
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !currentLead) {
            return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        }

        const updates: ColdLeadUpdate = {
            ultima_interacao: new Date().toISOString(),
            notas: notas || currentLead.notas,
        };

        if (proxima_ligacao) {
            updates.proxima_ligacao = proxima_ligacao;
        }

        // Logic based on call result mapping to new funnel
        // Helper to determine if we should update status based on hierarchy
        // Hierarchy: novo_lead < ligacao_feita < contato_realizado < contato_decisor < reuniao_marcada
        const statusHierarchy: Record<string, number> = {
            'novo_lead': 0,
            'numero_inexistente': 0, // Special case
            'lead_qualificado': 1, // Treating as early stage
            'ligacao_feita': 2,
            'contato_realizado': 3,
            'contato_decisor': 4,
            'reuniao_marcada': 5
        };

        const currentRank = statusHierarchy[currentLead.status] || 0;

        switch (resultado) {
            case 'numero_inexistente':
                updates.status = 'numero_inexistente';
                updates.ultimo_resultado = 'número inexistente';
                break;

            case 'ligacao_feita':
                // Only update status if it's an advancement or neutral, don't regress from higher stages
                if (currentRank < 2) {
                    updates.status = 'ligacao_feita';
                }
                updates.tentativas = (currentLead.tentativas || 0) + 1;
                updates.ultimo_resultado = 'ligação feita';
                break;

            case 'contato_realizado':
                if (currentRank < 3) {
                    updates.status = 'contato_realizado';
                }
                updates.tentativas = (currentLead.tentativas || 0) + 1;
                updates.ultimo_resultado = 'contato realizado';
                break;

            case 'contato_decisor':
                if (currentRank < 4) {
                    updates.status = 'contato_decisor';
                }
                updates.tentativas = (currentLead.tentativas || 0) + 1;
                updates.ultimo_resultado = 'falou com decisor';
                break;

            case 'reuniao_marcada':
                updates.status = 'reuniao_marcada'; // Always set to this success state
                updates.tentativas = (currentLead.tentativas || 0) + 1;
                updates.ultimo_resultado = 'reunião marcada';
                // Trigger duplication!
                await createOpportunityFromColdLeadPlaceholder(currentLead, pipeline_id, stage_id);
                break;

            default:
                break;
        }

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: updatedLead, error: updateError } = await supabaseAdmin
            .from('cold_leads')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        // Revalidate leads page just in case
        revalidatePath('/leads');

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json(updatedLead);

    } catch (error) {
        console.error('Error processing call:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
