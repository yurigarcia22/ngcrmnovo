
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
            const val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
            if (key.trim() === "NEXT_PUBLIC_SUPABASE_URL") supabaseUrl = val;
            if (key.trim() === "SUPABASE_SERVICE_ROLE_KEY") supabaseKey = val;
        }
    });
} catch (e) { }

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugWhatsApp() {
    console.log("--- Debugging WhatsApp Instances ---");

    // 1. Fetch Instances
    const { data: instances, error } = await supabase
        .from("whatsapp_instances")
        .select("id, instance_name, owner_profile_id, status, phone_number, profile_pic_url");

    if (error) {
        console.error("Error fetching instances:", error);
    } else {
        console.log(`Found ${instances?.length} instances.`);
        instances?.forEach(inst => {
            console.log(`\nInstance: ${inst.instance_name}`);
            console.log(`- Status: ${inst.status}`);
            console.log(`- Owner ID: ${inst.owner_profile_id}`);
            console.log(`- Phone: ${inst.phone_number}`);
            console.log(`- Pic: ${inst.profile_pic_url ? 'Yes' : 'No'}`);
        });
    }

    // 2. Check Profiles for those owners
    if (instances && instances.length > 0) {
        const ownerIds = instances.map(i => i.owner_profile_id).filter(Boolean);
        if (ownerIds.length > 0) {
            console.log("\n--- Checking Owners in Profiles ---");
            const { data: profiles, error: pError } = await supabase
                .from("profiles")
                .select("id, full_name, tenant_id")
                .in("id", ownerIds);

            if (pError) console.error("Error fetching profiles:", pError);
            else {
                profiles?.forEach(p => {
                    console.log(`Profile [${p.id}]: ${p.full_name} (Tenant: ${p.tenant_id})`);
                });
            }
        }
    }
}

debugWhatsApp();
