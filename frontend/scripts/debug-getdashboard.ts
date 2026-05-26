/**
 * Replica EXATAMENTE getDashboardData com filters padrao (today, all users)
 * e mostra qualquer exception.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
const env: Record<string, string> = {};
fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
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

const TENANT_ID = "00000000-0000-0000-0000-000000000000";

async function run(period: string) {
    console.log(`\n========== Testing period: ${period} ==========`);

    try {
        const nowUTC = new Date();
        const offsetHours = -3;
        const brT = new Date(nowUTC.getTime() + offsetHours * 3600 * 1000);
        let sYear = brT.getUTCFullYear();
        let sMonth = brT.getUTCMonth();
        let sDay = brT.getUTCDate();

        let startDate = new Date(Date.UTC(sYear, sMonth, sDay, 3, 0, 0, 0)).toISOString();
        let endDate = new Date(Date.UTC(sYear, sMonth, sDay, 26, 59, 59, 999)).toISOString();

        if (period === "week") {
            const weekStartBRT = new Date(brT);
            weekStartBRT.setUTCDate(brT.getUTCDate() - 7);
            startDate = new Date(Date.UTC(weekStartBRT.getUTCFullYear(), weekStartBRT.getUTCMonth(), weekStartBRT.getUTCDate(), 3, 0, 0, 0)).toISOString();
        } else if (period === "month") {
            startDate = new Date(Date.UTC(sYear, sMonth, 1, 3, 0, 0, 0)).toISOString();
        } else if (period === "all") {
            startDate = new Date(0).toISOString();
            endDate = new Date(Date.UTC(sYear, sMonth, sDay, 26, 59, 59, 999)).toISOString();
        }

        console.log("Range:", startDate, "->", endDate);

        // wonPrev only if period != all
        let wonPrevQuery: any = null;
        if (period !== "all") {
            const periodDurationMs = new Date(endDate).getTime() - new Date(startDate).getTime();
            if (periodDurationMs > 60_000 && periodDurationMs < 366 * 24 * 3600_000) {
                const prevStart = new Date(new Date(startDate).getTime() - periodDurationMs).toISOString();
                const prevEnd = startDate;
                console.log("Prev range:", prevStart, "->", prevEnd);
                wonPrevQuery = supabase
                    .from("deals")
                    .select("value", { count: "exact" })
                    .eq("status", "won")
                    .eq("tenant_id", TENANT_ID)
                    .gte("closed_at", prevStart)
                    .lte("closed_at", prevEnd);
            }
        }

        const leadsQuery = supabase.from("deals").select("id", { count: "exact", head: true }).eq("tenant_id", TENANT_ID).gte("created_at", startDate).lte("created_at", endDate);
        const openValueQuery = supabase.from("deals").select("value").neq("status", "won").neq("status", "lost").eq("tenant_id", TENANT_ID);
        const wonQuery = supabase.from("deals").select("value", { count: "exact" }).eq("status", "won").eq("tenant_id", TENANT_ID).gte("closed_at", startDate).lte("closed_at", endDate);
        const lostQuery = supabase.from("deals").select("value", { count: "exact" }).eq("status", "lost").eq("tenant_id", TENANT_ID).gte("closed_at", startDate).lte("closed_at", endDate);

        const results = await Promise.all([
            leadsQuery,
            openValueQuery,
            wonQuery,
            lostQuery,
            wonPrevQuery ?? Promise.resolve({ count: 0, data: [] }),
        ]);

        const [r1, r2, r3, r4, r5] = results as any[];
        console.log("leadsQuery:", r1.error ?? `count=${r1.count}`);
        console.log("openValueQuery:", r2.error ?? `${r2.data?.length} rows`);
        console.log("wonQuery:", r3.error ?? `count=${r3.count}, ${r3.data?.length} rows`);
        console.log("lostQuery:", r4.error ?? `count=${r4.count}, ${r4.data?.length} rows`);
        console.log("wonPrevQuery:", r5.error ?? `count=${r5.count}, ${r5.data?.length} rows`);

        console.log("\n>> Period", period, "OK");
    } catch (e: any) {
        console.error("!! ERRO no period", period, ":");
        console.error("Message:", e?.message);
        console.error("Stack:", e?.stack?.slice(0, 1500));
    }
}

async function main() {
    for (const p of ["today", "yesterday", "week", "month", "all"]) {
        await run(p);
    }
}

main();
