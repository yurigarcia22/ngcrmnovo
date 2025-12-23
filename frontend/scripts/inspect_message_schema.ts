
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

async function inspectMessage() {
    console.log("--- Inspecting Message Schema ---");
    const { data, error } = await supabase
        .from("messages")
        .select("*")
        .limit(1);

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Message Sample:", data[0]);
        if (data[0]) {
            console.log("Keys:", Object.keys(data[0]));
        }
    }
}

inspectMessage();
