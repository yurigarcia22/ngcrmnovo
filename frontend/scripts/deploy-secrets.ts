
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const envPath = path.resolve(process.cwd(), '.env.local');

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const secrets: string[] = [];

    envContent.split('\n').forEach(line => {
        const [key, ...valParts] = line.split('=');
        if (!key) return;

        const trimmedKey = key.trim();
        const val = valParts.join('=').trim().replace(/^["']|["']$/g, "");

        if (trimmedKey === 'NEXT_PUBLIC_SUPABASE_URL') {
            secrets.push(`SUPABASE_URL=${val}`);
        }
        if (trimmedKey === 'SUPABASE_SERVICE_ROLE_KEY') {
            secrets.push(`SUPABASE_SERVICE_ROLE_KEY=${val}`);
        }
    });

    if (secrets.length === 0) {
        console.error("No secrets found in .env.local");
        process.exit(1);
    }

    const cmd = `npx supabase secrets set ${secrets.join(' ')}`;
    console.log("Setting secrets...");

    exec(cmd, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return;
        }
        if (stderr) console.error(`Stderr: ${stderr}`);
        console.log(`Stdout: ${stdout}`);
    });

} catch (e) {
    console.error("Failed to read .env.local", e);
}
