import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getTenantId } from '@/app/actions';

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    const tenantId = await getTenantId();

    const { data, error } = await supabase
        .from('cold_leads')
        .select('nicho')
        .eq('tenant_id', tenantId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Extract unique niches and sort alphabetically
    const uniqueNiches = Array.from(new Set(data.map((lead: any) => lead.nicho)))
        .filter(Boolean)
        .sort();

    return NextResponse.json({ data: uniqueNiches });
}
