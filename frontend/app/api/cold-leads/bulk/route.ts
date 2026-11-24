import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getTenantId } from '@/app/actions';
import { canonicalizeNicho } from '@/lib/nicho';
import {
    chunk,
    isColdCallStageOfTenant,
    isMemberOfTenant,
    listTenantNichos,
    parseStageId,
} from '@/lib/cold-leads-api';

// .in('id', ids) vai na URL: com milhares de ids estourava o limite. Blocos de 200.
const ID_CHUNK = 200;

function parseIds(raw: unknown): string[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const ids = Array.from(new Set(raw.map((v) => String(v ?? '').trim()).filter(Boolean)));
    return ids.length > 0 ? ids : null;
}

export async function PATCH(request: NextRequest) {
    const supabase = await createClient();
    const body = await request.json().catch(() => ({}));
    const { updates } = body ?? {};
    const ids = parseIds(body?.ids);

    if (!ids) {
        return NextResponse.json({ error: 'IDs inválidos ou ausentes' }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Dados para atualização ausentes' }, { status: 400 });
    }

    let tenantId: string;
    try {
        tenantId = await getTenantId();
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 });
    }

    // Lista fechada de campos: nicho, responsavel_id e stage_id. tenant_id e status
    // nunca (o status e derivado da etapa pelo trigger do banco).
    const fieldsToUpdate: Record<string, any> = {};
    try {
        if (updates.nicho) {
            const existing = await listTenantNichos(supabase, tenantId);
            const nicho = canonicalizeNicho(String(updates.nicho), existing);
            if (!nicho) {
                return NextResponse.json({ error: 'Nicho inválido' }, { status: 400 });
            }
            fieldsToUpdate.nicho = nicho;
        }

        if (updates.responsavel_id) {
            // profiles pode ter RLS restrita: confere o vinculo com o service role
            const admin = createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
            const ok = await isMemberOfTenant(admin, tenantId, String(updates.responsavel_id));
            if (!ok) {
                return NextResponse.json({ error: 'Responsável inválido para esta empresa' }, { status: 400 });
            }
            fieldsToUpdate.responsavel_id = String(updates.responsavel_id);
        }

        if (updates.stage_id !== undefined && updates.stage_id !== null && updates.stage_id !== '') {
            const stageId = parseStageId(updates.stage_id);
            if (!stageId || !(await isColdCallStageOfTenant(supabase, tenantId, stageId))) {
                return NextResponse.json({ error: 'Etapa inválida para o funil de cold call' }, { status: 400 });
            }
            fieldsToUpdate.stage_id = stageId;
        }
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
        return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 });
    }

    let count = 0;
    for (const part of chunk(ids, ID_CHUNK)) {
        const { data, error } = await supabase
            .from('cold_leads')
            .update(fieldsToUpdate)
            .eq('tenant_id', tenantId)
            .in('id', part)
            .select('id');

        if (error) {
            console.error('Bulk update error:', error);
            return NextResponse.json(
                { error: `Erro ao atualizar leads: ${error.message}`, count },
                { status: 500 }
            );
        }
        count += data?.length ?? 0;
    }

    return NextResponse.json({ success: true, count });
}

export async function DELETE(request: NextRequest) {
    const supabase = await createClient();
    const body = await request.json().catch(() => ({}));
    const ids = parseIds(body?.ids);

    if (!ids) {
        return NextResponse.json({ error: 'IDs inválidos ou ausentes' }, { status: 400 });
    }

    let tenantId: string;
    try {
        tenantId = await getTenantId();
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 401 });
    }

    let count = 0;
    for (const part of chunk(ids, ID_CHUNK)) {
        const { data, error } = await supabase
            .from('cold_leads')
            .delete()
            .eq('tenant_id', tenantId)
            .in('id', part)
            .select('id');

        if (error) {
            console.error('Bulk delete error:', error);
            return NextResponse.json(
                { error: `Erro ao excluir leads: ${error.message}`, count },
                { status: 500 }
            );
        }
        count += data?.length ?? 0;
    }

    return NextResponse.json({ success: true, count });
}
