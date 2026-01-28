import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    // Security: Validate a CRON_SECRET if scheduling from external
    // const authHeader = request.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { return new Response('Unauthorized', { status: 401 }); }

    try {
        const supabase = await createClient();
        const now = new Date().toISOString();

        // 1. Find pending notifications that are due
        const { data: notifications, error } = await supabase
            .from('notifications')
            .select('*')
            .is('sent_at', null)
            .lte('scheduled_for', now)
            .limit(50); // Batch size

        if (error) throw error;
        if (!notifications || notifications.length === 0) {
            return NextResponse.json({ processed: 0 });
        }

        // 2. Mark them as sent
        const ids = notifications.map(n => n.id);
        const { error: updateError } = await supabase
            .from('notifications')
            .update({ sent_at: now })
            .in('id', ids);

        if (updateError) throw updateError;

        // 3. (Optional) If you had a websocket server or push notification service, 
        // you would trigger it here. Since Supabase Realtime listens to DB changes (UPDATE),
        // the client will automatically receive the 'UPDATE' event with sent_at filled!
        // So just updating the DB is enough to trigger the frontend "Toast".

        return NextResponse.json({ processed: notifications.length, ids });
    } catch (error: any) {
        console.error("Cron Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
