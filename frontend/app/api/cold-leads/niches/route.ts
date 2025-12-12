import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('cold_leads')
        .select('nicho');

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Extract unique niches and sort alphabetically
    const uniqueNiches = Array.from(new Set(data.map((lead: any) => lead.nicho)))
        .filter(Boolean)
        .sort();

    return NextResponse.json({ data: uniqueNiches });
}
