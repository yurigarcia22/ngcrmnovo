
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
} catch (e) { console.error("Error reading .env.local", e); }

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("--- Checking Schema ---");
    const { data, error } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .limit(1);

    if (error) console.error(error);
    else if (data && data.length > 0) {
        console.log("Keys found:", Object.keys(data[0]));
    } else {
        console.log("No rows found, cannot infer schema, but query worked.");
        // Try inserting to fail and see columns? Or just assume need to add.
    }
}
checkSchema();
