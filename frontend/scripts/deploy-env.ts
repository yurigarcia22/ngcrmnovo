
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const envPath = path.resolve(process.cwd(), '.env.local');
const tempEnvPath = path.resolve(process.cwd(), 'temp_secrets.env');

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    let secretContent = "";

    envContent.split('\n').forEach(line => {
        const [key, ...valParts] = line.split('=');
        if (!key) return;

        const trimmedKey = key.trim();
        const val = valParts.join('=').trim().replace(/^["']|["']$/g, "");

        if (trimmedKey === 'NEXT_PUBLIC_SUPABASE_URL') {
            secretContent += `SUPABASE_URL=${val}\n`;
        }
        if (trimmedKey === 'SUPABASE_SERVICE_ROLE_KEY') {
            secretContent += `SUPABASE_SERVICE_ROLE_KEY=${val}\n`;
        }
    });

    if (!secretContent) {
        console.error("No secrets found.");
        process.exit(1);
    }

    fs.writeFileSync(tempEnvPath, secretContent);
    console.log("Created temp_secrets.env");

    console.log("Running supabase secrets set...");
    execSync(`npx supabase secrets set --env-file "${tempEnvPath}"`, { stdio: 'inherit' });
    console.log("Secrets set successfully.");

} catch (e: any) {
    console.error("Error:", e.message);
} finally {
    if (fs.existsSync(tempEnvPath)) {
        fs.unlinkSync(tempEnvPath);
        console.log("Cleaned up temp_secrets.env");
    }
}
