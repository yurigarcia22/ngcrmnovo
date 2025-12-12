import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { ColdLead, ColdLeadUpdate } from '@/types/cold-lead';

// Placeholder for Kanban integration
async function createOpportunityFromColdLeadPlaceholder(lead: ColdLead) {
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
    let cleanPhone = lead.telefone.replace(/\D/g, "");
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
    let pipelineId;
    const { data: pipelines } = await supabase
        .from("pipelines")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .ilike("name", "%Funil de Vendas%");

    if (pipelines && pipelines.length > 0) {
        pipelineId = pipelines[0].id;
    } else {
        // Fallback to first available pipeline
        const { data: firstPipeline } = await supabase
            .from("pipelines")
            .select("id")
            .eq("tenant_id", tenantId)
            .limit(1)
            .single();
        if (firstPipeline) pipelineId = firstPipeline.id;
    }

    if (!pipelineId) {
        console.error('No pipeline found');
        return;
    }

    // 5. Get 'Novos Leads' Stage of that Pipeline
    let stageId;
    const { data: stages } = await supabase
        .from("stages")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("pipeline_id", pipelineId)
        .ilike("name", "%Novo%") // Matches 'Novos Leads', 'Novo Lead', etc.
        .limit(1);

    if (stages && stages.length > 0) {
        stageId = stages[0].id;
    } else {
        // Fallback to first position
        const { data: firstStage } = await supabase
            .from("stages")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("pipeline_id", pipelineId)
            .order("position", { ascending: true })
            .limit(1)
            .single();

        if (firstStage) stageId = firstStage.id;
    }

    if (!stageId) {
        console.error('No stages found for pipeline:', pipelineId);
        return;
    }

    // 6. Create Deal
    const { error: dealError } = await supabase
        .from("deals")
        .insert({
            title: lead.nome,
            value: 0,
            contact_id: contactId,
            stage_id: stageId,
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
        const { resultado, notas, proxima_ligacao } = await request.json();

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
        switch (resultado) {
            case 'nao_atendeu':
                updates.tentativas = (currentLead.tentativas || 0) + 1;
                updates.ultimo_resultado = 'não atendeu';
                break;

            case 'lead_qualificado':
                updates.status = 'lead_qualificado';
                updates.ultimo_resultado = 'qualificado manually';
                break;

            case 'ligacao_feita':
                updates.status = 'ligacao_feita';
                updates.tentativas = (currentLead.tentativas || 0) + 1;
                updates.ultimo_resultado = 'ligação feita';
                break;

            case 'contato_realizado':
                updates.status = 'contato_realizado';
                updates.tentativas = (currentLead.tentativas || 0) + 1;
                updates.ultimo_resultado = 'contato realizado';
                break;

            case 'contato_decisor':
                updates.status = 'contato_decisor';
                updates.ultimo_resultado = 'falou com decisor';
                break;

            case 'reuniao_marcada':
                updates.status = 'reuniao_marcada';
                updates.ultimo_resultado = 'reunião marcada';
                // Trigger duplication!
                await createOpportunityFromColdLeadPlaceholder(currentLead);
                break;

            default:
                break;
        }

        const { data: updatedLead, error: updateError } = await supabase
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
