import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function PATCH(request: NextRequest) {
    const supabase = await createClient();
    const body = await request.json();
    const { ids, updates } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'IDs inválidos ou ausentes' }, { status: 400 });
    }

    if (!updates || Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'Dados para atualização ausentes' }, { status: 400 });
    }

    // Prepare fields to update
    const fieldsToUpdate: any = {};
    if (updates.nicho) fieldsToUpdate.nicho = updates.nicho;
    if (updates.responsavel_id) fieldsToUpdate.responsavel_id = updates.responsavel_id;
    // Add other fields here if needed in the future

    if (Object.keys(fieldsToUpdate).length === 0) {
        return NextResponse.json({ error: 'Nenhum campo válido para atualizar' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('cold_leads')
        .update(fieldsToUpdate)
        .in('id', ids)
        .select();

    if (error) {
        console.error('Bulk update error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: data?.length });
}
