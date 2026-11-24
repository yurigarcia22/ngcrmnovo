import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { resolveStageIdInPipeline, resolveLeadPipelineId } from '@/lib/cold-call-stages';
import { ensureDealForColdLead } from '@/lib/cold-call-convert';
import { brLocalToISO } from '@/lib/br-time';

// Metadados de cada resultado.
//   always=true  -> aplica a coluna sempre (terminais e reuniao marcada).
//   always=false -> intermediarios: SO AVANCAM, nunca regridem a coluna.
// Registrar "ligacao feita" num lead que ja esta em "falou com decisor" conta a
// interacao (nota) sem puxar o lead pra tras no funil.
// O status text e derivado da etapa no banco (trigger trg_cold_lead_sync); aqui ele
// so vai junto pra diferenciar resultados que caem na mesma coluna (sem_interesse x
// perdido em "Descartado").
const RESULT_META: Record<string, { status: string; label: string; countsTentativa: boolean; always?: boolean; meeting?: boolean }> = {
    numero_inexistente: { status: 'numero_inexistente', label: 'número inexistente', countsTentativa: false, always: true },
    sem_interesse: { status: 'sem_interesse', label: 'sem interesse', countsTentativa: true, always: true },
    ligacao_feita: { status: 'ligacao_feita', label: 'ligação feita', countsTentativa: true },
    contato_realizado: { status: 'contato_realizado', label: 'contato realizado', countsTentativa: true },
    contato_decisor: { status: 'contato_decisor', label: 'falou com decisor', countsTentativa: true },
    reuniao_marcada: { status: 'reuniao_marcada', label: 'reunião marcada', countsTentativa: true, always: true, meeting: true },
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { id } = await params;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

        const admin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: profile } = await admin.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
        const tenantId = profile?.tenant_id as string | undefined;
        if (!tenantId) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });

        const { resultado, notas, proxima_ligacao, pipeline_id, stage_id } = await request.json();
        const meta = RESULT_META[resultado as string];
        if (!meta) return NextResponse.json({ error: 'Resultado inválido' }, { status: 400 });

        const { data: currentLead } = await admin
            .from('cold_leads')
            .select('*')
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .maybeSingle();
        if (!currentLead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

        const meetingAt = brLocalToISO(proxima_ligacao);
        if (meta.meeting && !meetingAt) {
            return NextResponse.json({ error: 'Data da reunião inválida' }, { status: 400 });
        }

        const updates: Record<string, any> = {
            ultima_interacao: new Date().toISOString(),
            ultimo_resultado: meta.label,
        };
        if (meetingAt) updates.proxima_ligacao = meetingAt;

        // Coluna-alvo no funil em que o lead esta (ou no funil de cold call padrao).
        const pipelineId = await resolveLeadPipelineId(admin, tenantId, currentLead.stage_id);
        const targetStageId = pipelineId ? await resolveStageIdInPipeline(admin, pipelineId, meta.status) : null;

        let moved = false;
        if (targetStageId) {
            let applyMove = !!meta.always || !currentLead.stage_id;
            if (!applyMove) {
                const { data: pos } = await admin
                    .from('stages').select('id, position')
                    .in('id', [currentLead.stage_id, targetStageId]);
                const curPos = pos?.find((s: any) => Number(s.id) === Number(currentLead.stage_id))?.position ?? -1;
                const tgtPos = pos?.find((s: any) => Number(s.id) === Number(targetStageId))?.position ?? null;
                applyMove = tgtPos !== null && tgtPos > curPos;
            }
            if (applyMove) {
                updates.stage_id = targetStageId;
                updates.status = meta.status;
                moved = true;
            }
        }
        // Sem coluna equivalente no funil: nao mexe em status nem coluna (antes so o
        // status mudava e o lead ficava dessincronizado). A nota ainda conta no dashboard.

        const { data: updatedLead, error: updateError } = await admin
            .from('cold_leads')
            .update(updates)
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .select()
            .single();
        if (updateError) {
            console.error('Update cold_lead failed:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Tentativas: incremento atomico no banco (dois vendedores no mesmo lead nao perdem contagem).
        if (meta.countsTentativa) {
            const { data: t } = await admin.rpc('cold_lead_inc_tentativas', { p_lead_id: id, p_tenant_id: tenantId });
            if (typeof t === 'number') (updatedLead as any).tentativas = t;
        }

        const warnings: string[] = [];

        // Reuniao marcada: a venda e criada pelo trigger do banco quando o lead entra na
        // etapa de ganho. Se o funil nao tem etapa de ganho equivalente, cria aqui.
        let dealId: string | null = (updatedLead as any).converted_deal_id ?? null;
        if (meta.meeting) {
            if (!dealId) {
                dealId = await ensureDealForColdLead(admin, tenantId, updatedLead as any, user.id);
                if (!dealId) warnings.push('Não foi possível criar a venda no funil de vendas.');
            }
            if (dealId) {
                // Etapa escolhida no modal (funil de vendas do proprio tenant).
                if (stage_id) {
                    const { data: st } = await admin
                        .from('stages').select('id, pipelines!inner(kind, tenant_id)')
                        .eq('id', stage_id).eq('tenant_id', tenantId).maybeSingle();
                    if (st && (st as any).pipelines?.kind === 'deals') {
                        await admin.from('deals').update({ stage_id: st.id }).eq('id', dealId).eq('tenant_id', tenantId);
                    }
                }
                // Tarefa da reuniao, com responsavel (senao nao aparece no Meu Dia). Nao duplica.
                const { data: existingTask } = await admin
                    .from('tasks').select('id')
                    .eq('tenant_id', tenantId).eq('deal_id', dealId).eq('is_completed', false)
                    .eq('due_date', meetingAt).limit(1).maybeSingle();
                if (!existingTask) {
                    const { error: taskError } = await admin.from('tasks').insert({
                        deal_id: dealId,
                        cold_lead_id: id,
                        description: 'Reunião de Apresentação (Origem: Cold Call)',
                        due_date: meetingAt,
                        is_completed: false,
                        tenant_id: tenantId,
                        assigned_to: currentLead.responsavel_id || user.id,
                    });
                    if (taskError) {
                        console.error('Error creating meeting task:', taskError);
                        warnings.push('A reunião não virou tarefa: ' + taskError.message);
                    }
                }
            }
            revalidatePath('/leads');
        }

        // Nota digitada vira historico (antes sobrescrevia cold_leads.notas e apagava
        // as notas que vieram da planilha).
        const noteRows: any[] = [];
        if (typeof notas === 'string' && notas.trim()) {
            noteRows.push({ cold_lead_id: id, content: notas.trim(), created_by: user.id });
        }
        // Nota de metrica do dashboard (ele conta "Interação Registrada: <chave>").
        noteRows.push({ cold_lead_id: id, content: `Interação Registrada: ${resultado}`, created_by: user.id });
        const { error: noteErr } = await admin.from('cold_lead_notes').insert(noteRows);
        if (noteErr) {
            console.error('Failed to log activity:', noteErr);
            warnings.push('A interação não foi registrada no histórico: ' + noteErr.message);
        }

        revalidatePath('/cold-call');
        return NextResponse.json({ ...updatedLead, converted_deal_id: dealId, moved, warnings });
    } catch (error: any) {
        console.error('Error processing call:', error);
        return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
    }
}
