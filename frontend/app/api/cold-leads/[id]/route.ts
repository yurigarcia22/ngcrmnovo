import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Mapa de status text legado -> nome canonico da stage no funil padrao de cold_call
const STATUS_TO_STAGE_NAME: Record<string, string> = {
    novo: "Novo",
    novo_lead: "Novo",
    tentativa_inicial: "Tentativa 1",
    ligacao_feita: "Tentativa 1",
    em_follow_up: "Tentativa 2+",
    lead_qualificado: "Tentativa 2+",
    contato_realizado: "Contato feito",
    contato_decisor: "Falou c/ decisor",
    reuniao_marcada: "Reunião marcada",
    convertido: "Convertido",
    descartado: "Descartado",
    numero_inexistente: "Descartado",
};

async function resolveStageIdFromStatus(
    tenantId: string,
    statusText: string,
): Promise<number | null> {
    const stageName = STATUS_TO_STAGE_NAME[statusText];
    if (!stageName) return null;

    const admin = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await admin
        .from('stages')
        .select('id, pipelines!inner(tenant_id, kind, is_default)')
        .eq('name', stageName)
        .eq('pipelines.tenant_id', tenantId)
        .eq('pipelines.kind', 'cold_call')
        .eq('pipelines.is_default', true)
        .maybeSingle();
    return (data?.id as number | undefined) ?? null;
}

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

    // Sanitize body
    const updates: any = { ...body };

    if (updates.responsavel_id === '') updates.responsavel_id = null;

    delete updates.id;
    delete updates.created_at;

    // Sincroniza status -> stage_id se status veio mas stage_id nao
    if (updates.status && !updates.stage_id) {
        // Resolve tenant do lead atual
        const { data: leadRow } = await supabase
            .from('cold_leads')
            .select('tenant_id')
            .eq('id', id)
            .maybeSingle();
        if (leadRow?.tenant_id) {
            const resolvedStageId = await resolveStageIdFromStatus(
                leadRow.tenant_id,
                updates.status,
            );
            if (resolvedStageId) updates.stage_id = resolvedStageId;
        }
    }

    const { data, error } = await supabase
        .from('cold_leads')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error updating cold lead:', error);
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
