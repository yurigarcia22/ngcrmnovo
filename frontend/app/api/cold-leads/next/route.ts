import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const body = await request.json().catch(() => ({}));

    const { responsavelId, nicho } = body;
    const now = new Date().toISOString();

    // Strategy 1: Follow-ups that are due
    let query1 = supabase
        .from('cold_leads')
        .select('*')
        .eq('status', 'follow_up')
        .lte('proxima_ligacao', now);

    if (responsavelId) query1 = query1.eq('responsavel_id', responsavelId);
    if (nicho) query1 = query1.eq('nicho', nicho);

    const { data: data1, error: error1 } = await query1
        .order('proxima_ligacao', { ascending: true })
        .limit(1)
        .single();

    if (data1) {
        return NextResponse.json(data1);
    }

    // Strategy 2: New or In Contact
    let query2 = supabase
        .from('cold_leads')
        .select('*')
        .in('status', ['novo', 'em_contato']);

    if (responsavelId) query2 = query2.eq('responsavel_id', responsavelId);
    if (nicho) query2 = query2.eq('nicho', nicho);

    const { data: data2, error: error2 } = await query2
        .order('tentativas', { ascending: true })
        .order('ultima_interacao', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

    if (data2) {
        return NextResponse.json(data2);
    }

    return NextResponse.json(null);
}
