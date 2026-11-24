import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { resolveStageIdInPipeline, resolveLeadPipelineId } from '@/lib/cold-call-stages';
import { canonicalizeNichoOrDefault } from '@/lib/nicho';

// Campos que a tela pode editar. tenant_id, tentativas, converted_deal_id, locked_* etc
// nunca vem do cliente (o trigger tambem bloqueia troca de tenant).
const EDITABLE = new Set([
    'nome', 'telefone', 'email', 'nicho', 'responsavel_id', 'site_url', 'instagram_url',
    'google_meu_negocio_url', 'notas', 'custom_fields', 'proxima_ligacao', 'stage_id', 'status',
]);

// Busca um lead pelo id (RLS restringe ao tenant do usuario). Usado para abrir
// um lead a partir do follow-up mesmo quando a etapa dele nao esta carregada.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { id } = await params;

    const { data, error } = await supabase
        .from('cold_leads')
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }
    return NextResponse.json(data);
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { id } = await params;
    const body = await request.json();

    const updates: any = {};
    for (const [k, v] of Object.entries(body ?? {})) if (EDITABLE.has(k)) updates[k] = v;
    if (updates.responsavel_id === '') updates.responsavel_id = null;
    if ('nicho' in updates) updates.nicho = canonicalizeNichoOrDefault(updates.nicho);

    // Status sem etapa: acha a coluna equivalente NO FUNIL DO LEAD. Sem coluna
    // equivalente o status e descartado (o status e derivado da etapa pelo banco;
    // gravar so o status deixava o lead dessincronizado).
    if (updates.status && !updates.stage_id) {
        const admin = createServiceClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        const { data: leadRow } = await supabase
            .from('cold_leads')
            .select('tenant_id, stage_id')
            .eq('id', id)
            .maybeSingle();
        if (!leadRow) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
        const pipelineId = await resolveLeadPipelineId(admin, leadRow.tenant_id, leadRow.stage_id);
        const resolved = pipelineId ? await resolveStageIdInPipeline(admin, pipelineId, updates.status) : null;
        if (resolved) updates.stage_id = resolved;
        else delete updates.status;
    }
    if (!Object.keys(updates).length) {
        return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('cold_leads')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error updating cold lead:', error);
        if ((error as any).code === '23505') {
            return NextResponse.json({ error: 'Já existe um lead com esse telefone.' }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
        return NextResponse.json({ error: 'Lead not found or permission denied' }, { status: 404 });
    }

    return NextResponse.json(data);
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { id } = await params;

    const { error } = await supabase
        .from('cold_leads')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting cold lead:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
