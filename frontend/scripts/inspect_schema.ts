
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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

async function inspectSchema() {
    console.log("--- Inspecting Deals Schema ---");
    const { data: deals } = await supabase.from("deals").select("*").limit(1);
    if (deals && deals[0]) console.log("Deal Keys:", Object.keys(deals[0]));

    console.log("--- Inspecting Contacts Schema ---");
    const { data: contacts } = await supabase.from("contacts").select("*").limit(1);
    if (contacts && contacts[0]) console.log("Contact Keys:", Object.keys(contacts[0]));
}

inspectSchema();
