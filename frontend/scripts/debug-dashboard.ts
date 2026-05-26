/**
 * Debug do dashboard: roda exatamente a logica de getSellersPerformance
 * fora do Next, com service role, e mostra exception completa.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
const env: Record<string, string> = {};
const envContent = fs.readFileSync(envPath, "utf-8");
envContent.split("\n").forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const idx = t.indexOf("=");
    if (idx <= 0) return;
    env[t.substring(0, idx).trim()] = t.substring(idx + 1).trim().replace(/^["']|["']$/g, "");
});

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
);

const TENANT_ID = "00000000-0000-0000-0000-000000000000"; // GRUPO NG

async function main() {
    console.log("== Iniciando debug ==");

    const brT = new Date(Date.now() - 3 * 3600 * 1000);
    const sYear = brT.getUTCFullYear();
    const sMonth = brT.getUTCMonth();
    const sDay = brT.getUTCDate();
    const startDate = new Date(Date.UTC(sYear, sMonth, sDay, 3, 0, 0)).toISOString();
    const endDate = new Date(Date.UTC(sYear, sMonth, sDay, 26, 59, 59)).toISOString();

    console.log("Range:", startDate, "->", endDate);

    try {
        const [
            profilesRes,
            dealsRes,
            tasksRes,
            messagesRes,
        ] = await Promise.all([
            supabase
                .from("profiles")
                .select("id, full_name, avatar_url")
                .eq("tenant_id", TENANT_ID)
                .eq("is_active", true),
            supabase
                .from("deals")
                .select("id, owner_id, status, value, closed_at, created_at")
                .eq("tenant_id", TENANT_ID),
            supabase
                .from("tasks")
                .select("id, assigned_to, is_completed, due_date")
                .eq("tenant_id", TENANT_ID),
            supabase
                .from("messages")
                .select("id, deal_id, contact_id, direction, created_at, deals!inner(owner_id, tenant_id)")
                .eq("tenant_id", TENANT_ID)
                .gte("created_at", startDate)
                .lte("created_at", endDate),
        ]);

        console.log("profiles:", profilesRes.error ?? `${profilesRes.data?.length} rows`);
        console.log("deals:", dealsRes.error ?? `${dealsRes.data?.length} rows`);
        console.log("tasks:", tasksRes.error ?? `${tasksRes.data?.length} rows`);
        console.log("messages:", messagesRes.error ?? `${messagesRes.data?.length} rows`);

        if (messagesRes.data && messagesRes.data.length > 0) {
            console.log("\n  Primeira msg sample:", JSON.stringify(messagesRes.data[0], null, 2));
        }

        // Tenta o loop que pode estar quebrando
        const messages = messagesRes.data ?? [];
        const myMsgs = messages.filter((m: any) => m.deals?.owner_id === "cc8428b0-7bac-40d0-8a27-447ffc323106");
        console.log("\n  Yuri msgs:", myMsgs.length);

        // Sort de mensagens — pode quebrar se created_at for null
        const byDeal: Record<string, any[]> = {};
        for (const m of myMsgs) {
            if (!byDeal[m.deal_id]) byDeal[m.deal_id] = [];
            byDeal[m.deal_id].push(m);
        }
        for (const dealMsgs of Object.values(byDeal)) {
            (dealMsgs as any[]).sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
        }

        console.log("\n== Debug rodou ate o fim sem erro ==");
    } catch (e: any) {
        console.error("\n!! ERRO PEGO !!");
        console.error("Message:", e?.message);
        console.error("Stack:", e?.stack);
    }
}

main();
