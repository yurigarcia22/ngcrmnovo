import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Manually read .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
let supabaseUrl = "";
let supabaseKey = "";

try {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach(line => {
        const [key, ...valParts] = line.split("=");
        if (key && valParts.length > 0) {
            const val = valParts.join("=").trim().replace(/^["']|["']$/g, ""); // Remove quotes
            if (key.trim() === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = val;
            if (key.trim() === "SUPABASE_SERVICE_ROLE_KEY") supabaseKey = val;
        }
    });

    if (!supabaseUrl || !supabaseKey) {
        // Try fallback to process.env if running in environment that has them
        supabaseUrl = supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
        supabaseKey = supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    }

} catch (e) {
    console.error("Error reading .env.local:", e);
}

console.log("URL Found:", !!supabaseUrl);
console.log("KEY Found:", !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProfiles() {
    console.log("--- Checking Profiles ---");

    // 1. Get all profiles
    const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, full_name, tenant_id");

    if (error) {
        console.error("Error fetching profiles:", error);
        return;
    }

    console.log(`Found ${profiles?.length || 0} profiles.`);

    // Group by tenant
    const byTenant: Record<string, any[]> = {};
    profiles?.forEach(p => {
        const t = p.tenant_id || "NO_TENANT";
        if (!byTenant[t]) byTenant[t] = [];
        byTenant[t].push(p.full_name || p.id);
    });

    console.log("\nProfiles by Tenant:");
    Object.entries(byTenant).forEach(([tenant, names]) => {
        console.log(`Tenant ${tenant}:`);
        names.forEach(n => console.log(` - ${n}`));
    });

    // 2. Check Tenants table
    console.log("\n--- Checking Tenants ---");
    const { data: tenants, error: tErr } = await supabase.from("tenants").select("*");
    if (tErr) console.error("Error fetching tenants:", tErr);
    else {
        tenants?.forEach(t => console.log(`Tenant: ${t.id} - ${t.name}`));
    }
}

checkProfiles();
