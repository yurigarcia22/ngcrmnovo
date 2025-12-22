import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const supabase = await createClient();
    const { id } = await params;
    const body = await request.json();

    // Sanitize body
    const updates: any = { ...body };

    // Handle UUID fields that might come as empty strings
    if (updates.responsavel_id === '') {
        updates.responsavel_id = null;
    }

    // Remove immutable fields if present (just in case)
    delete updates.id;
    delete updates.created_at;

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
