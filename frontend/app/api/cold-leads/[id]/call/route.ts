import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { ColdLead, ColdLeadUpdate } from '@/types/cold-lead';
import { resolveStageIdInPipeline } from '@/lib/cold-call-stages';

// Placeholder for Kanban integration
async function createOpportunityFromColdLeadPlaceholder(lead: ColdLead, pipelineId?: string, stageId?: string, meetingDate?: string) {
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
    // Leva o decisor (nome + telefone direto) do cold lead pro deal, para o card
    // de /leads mostrar (usa custom_values.responsible_name / responsible_direct_phone).
    const decisorNome = (lead as any).custom_fields?.decisor_nome;
    const decisorTelefone = (lead as any).custom_fields?.decisor_telefone;
    const dealCustomValues: any = {};
    if (decisorNome) dealCustomValues.responsible_name = decisorNome;
    if (decisorTelefone) dealCustomValues.responsible_direct_phone = decisorTelefone;

    const { data: newDeal, error: dealError } = await supabase
        .from("deals")
        .insert({
            title: lead.nome,
            value: 0,
            contact_id: contactId,
            stage_id: targetStageId,
            status: "open",
            tenant_id: tenantId,
            owner_id: user.id,
            custom_values: Object.keys(dealCustomValues).length ? dealCustomValues : null,
        })
        .select("id")
        .single();

    if (dealError) {
        console.error('Error creating deal:', dealError);
    } else {
        console.log('Opportunity created successfully for lead:', lead.id);

        // 7. Create Task if meeting date provided
        if (meetingDate && newDeal) {
            const { error: taskError } = await supabase
                .from("tasks")
                .insert({
                    deal_id: newDeal.id,
                    description: "Reunião de Apresentação (Origem: Cold Call)",
                    due_date: meetingDate,
                    is_completed: false,
                    tenant_id: tenantId
                });
            if (taskError) console.error('Error creating meeting task:', taskError);
        }

        // 8. Replicate Cold Lead History (Notes) to Deal Notes
        try {
            // Use Admin client to bypass RLS issues during replication
            const supabaseAdmin = createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );

            const { data: leadNotes } = await supabaseAdmin
                .from("cold_lead_notes")
                .select("*")
                .eq("cold_lead_id", lead.id)
                .order("created_at", { ascending: true });

            if (leadNotes && leadNotes.length > 0) {
                // Fetch creator names
                const userIds = Array.from(new Set(leadNotes.map(n => n.created_by).filter(Boolean)));
                const userMap: Record<string, string> = {};

                if (userIds.length > 0) {
                    const { data: profiles } = await supabaseAdmin
                        .from('profiles')
                        .select('id, full_name')
                        .in('id', userIds);

                    if (profiles) {
                        profiles.forEach(p => {
                            userMap[p.id] = p.full_name || 'Usuário';
                        });
                    }
                }

                const notesToInsert = leadNotes.map(note => {
                    const authorName = note.created_by ? (userMap[note.created_by] || 'Usuário Desconhecido') : 'Sistema';
                    return {
                        deal_id: newDeal.id,
                        content: `[Histórico Cold Call]: ${note.content} (por ${authorName})`,
                        tenant_id: tenantId,
                        created_at: note.created_at
                    };
                });

                const { error: notesError } = await supabaseAdmin
                    .from("notes")
                    .insert(notesToInsert);

                if (notesError) {
                    console.error('Error replicating notes (DB):', notesError);
                } else {
                    console.log(`Successfully replicated ${notesToInsert.length} notes.`);
                }
            } else {
                console.log("No cold lead notes to replicate.");
            }
        } catch (e) {
            console.error('Failed to replicate notes (Exception):', e);
        }

        // Clean cache for leads page
        try {
            revalidatePath('/leads');
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

        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Metadados de cada resultado.
        //   always=true  -> aplica status/coluna sempre (terminais e reuniao marcada).
        //   always=false -> intermediarios: SO AVANCAM, nunca regridem a coluna.
        // Assim, registrar "ligacao feita" num lead que ja esta em "falou com decisor"
        // conta a interacao (nota) sem puxar o lead pra tras no funil.
        const RESULT_META: Record<string, { status: string; label: string; countsTentativa: boolean; always?: boolean; duplicate?: boolean }> = {
            numero_inexistente: { status: 'numero_inexistente', label: 'número inexistente', countsTentativa: false, always: true },
            sem_interesse: { status: 'sem_interesse', label: 'sem interesse', countsTentativa: true, always: true },
            ligacao_feita: { status: 'ligacao_feita', label: 'ligação feita', countsTentativa: true },
            contato_realizado: { status: 'contato_realizado', label: 'contato realizado', countsTentativa: true },
            contato_decisor: { status: 'contato_decisor', label: 'falou com decisor', countsTentativa: true },
            reuniao_marcada: { status: 'reuniao_marcada', label: 'reunião marcada', countsTentativa: true, always: true, duplicate: true },
        };

        const meta = RESULT_META[resultado as string];
        if (meta) {
            if (meta.countsTentativa) updates.tentativas = (currentLead.tentativas || 0) + 1;
            updates.ultimo_resultado = meta.label;

            // Compara pela POSICAO real da coluna (nao pelo status text, que pode estar
            // dessincronizado quando o card foi arrastado a mao no kanban).
            let applyMove = !!meta.always;
            let targetStageId: number | null = null;

            if ((currentLead as any).stage_id) {
                const { data: curStage } = await supabaseAdmin
                    .from('stages')
                    .select('id, position, pipeline_id')
                    .eq('id', (currentLead as any).stage_id)
                    .maybeSingle();

                if (curStage?.pipeline_id) {
                    targetStageId = await resolveStageIdInPipeline(supabaseAdmin, curStage.pipeline_id, meta.status);
                    if (!applyMove && targetStageId) {
                        const { data: tgt } = await supabaseAdmin
                            .from('stages')
                            .select('position')
                            .eq('id', targetStageId)
                            .maybeSingle();
                        const curPos = (curStage.position ?? -1) as number;
                        const tgtPos = (tgt?.position ?? null) as number | null;
                        // So avanca: a coluna-alvo tem que estar estritamente a frente.
                        if (tgtPos !== null && tgtPos > curPos) applyMove = true;
                    }
                }
            } else {
                // Sem coluna atual: nao ha de onde regredir.
                applyMove = true;
            }

            if (applyMove) {
                updates.status = meta.status;
                if (targetStageId) (updates as any).stage_id = targetStageId;

                // Reuniao marcada gera a oportunidade no funil de vendas.
                if (meta.duplicate) {
                    try {
                        await createOpportunityFromColdLeadPlaceholder(currentLead, pipeline_id, stage_id, proxima_ligacao);
                    } catch (dupError) {
                        console.error("Duplication failed but continuing:", dupError);
                    }
                }
            }
            // Se nao avancou: mantem status e coluna atuais. A nota abaixo ainda
            // registra a interacao para as metricas do dashboard.
        }

        console.log("Updating cold lead status to:", updates.status);

        const { data: updatedLead, error: updateError } = await supabaseAdmin
            .from('cold_leads')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        // Revalidate leads page just in case
        revalidatePath('/leads');

        if (updateError) {
            console.error("Update cold_lead failed:", updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        console.log("Cold lead updated successfully:", updatedLead?.id);

        // Log activity in cold_lead_notes for dashboard metrics
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabaseAdmin.from('cold_lead_notes').insert({
                    cold_lead_id: id,
                    content: `Interação Registrada: ${resultado}`,
                    created_by: user.id
                });
            }
        } catch (logError) {
            console.error("Failed to log activity:", logError);
        }

        return NextResponse.json(updatedLead);

    } catch (error) {
        console.error('Error processing call:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
