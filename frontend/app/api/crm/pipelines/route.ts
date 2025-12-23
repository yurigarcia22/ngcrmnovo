
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // Get profile to access tenant_id
        const { data: profile } = await supabase
            .from("profiles")
            .select("tenant_id")
            .eq("id", user.id)
            .single();

        if (!profile) {
            return new NextResponse("Profile not found", { status: 404 });
        }

        const tenantId = profile.tenant_id;

        // Fetch pipelines
        const { data: pipelines, error: pipeError } = await supabase
            .from("pipelines")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: true });

        if (pipeError) throw pipeError;

        // Fetch all stages for these pipelines
        const { data: stages, error: stageError } = await supabase
            .from("stages")
            .select("*")
            .eq("tenant_id", tenantId)
            .in("pipeline_id", pipelines.map(p => p.id))
            .order("position", { ascending: true });

        if (stageError) throw stageError;

        // Nest stages into pipelines
        const result = pipelines.map(p => ({
            ...p,
            stages: stages.filter(s => s.pipeline_id === p.id)
        }));

        return NextResponse.json(result);

    } catch (error) {
        console.error("Pipeline API Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
