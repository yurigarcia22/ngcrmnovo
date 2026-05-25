/**
 * Cria (ou atualiza) o primeiro super-admin da plataforma.
 *
 * Uso:
 *   1. Adicione em .env.local:
 *        ADMIN_INITIAL_EMAIL=seu@email.com
 *        ADMIN_INITIAL_PASSWORD=senha-forte-aqui
 *        ADMIN_INITIAL_FULL_NAME=Seu Nome
 *
 *   2. Rode:
 *        npx tsx frontend/scripts/seed-platform-admin.ts
 *
 *   3. Apos confirmar que conseguiu logar em /admin/login,
 *      REMOVA as 3 vars acima do .env.local.
 *
 * Idempotente: se ja existir um admin com aquele email, atualiza a senha.
 */

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

// =====================================================================
// Carregar .env.local manualmente (mesmo padrao dos outros scripts)
// =====================================================================
const envPath = path.resolve(process.cwd(), ".env.local");
const env: Record<string, string> = {};

try {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const idx = trimmed.indexOf("=");
        if (idx <= 0) return;
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed
            .substring(idx + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
        env[key] = val;
    });
} catch (e) {
    console.error("Erro lendo .env.local:", e);
    process.exit(1);
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const email = (env.ADMIN_INITIAL_EMAIL ?? "").toLowerCase().trim();
const password = env.ADMIN_INITIAL_PASSWORD ?? "";
const fullName = env.ADMIN_INITIAL_FULL_NAME ?? null;

if (!supabaseUrl || !supabaseKey) {
    console.error("Falta NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local");
    process.exit(1);
}

if (!email || !password) {
    console.error(
        "Defina ADMIN_INITIAL_EMAIL e ADMIN_INITIAL_PASSWORD em .env.local antes de rodar."
    );
    process.exit(1);
}

if (password.length < 10) {
    console.error("ADMIN_INITIAL_PASSWORD precisa ter ao menos 10 caracteres.");
    process.exit(1);
}

// =====================================================================
// Hash e upsert
// =====================================================================
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
});

(async () => {
    console.log(`Hasheando senha para ${email}...`);
    const passwordHash = await bcrypt.hash(password, 12);

    // Verifica se ja existe
    const { data: existing } = await supabase
        .from("platform_admins")
        .select("id, email")
        .eq("email", email)
        .maybeSingle();

    if (existing) {
        console.log(`Admin ${email} ja existe. Atualizando senha e ativando...`);
        const { error } = await supabase
            .from("platform_admins")
            .update({
                password_hash: passwordHash,
                full_name: fullName,
                is_active: true,
            })
            .eq("id", existing.id);
        if (error) {
            console.error("Erro ao atualizar:", error);
            process.exit(1);
        }
        console.log("Atualizado com sucesso.");
    } else {
        console.log(`Criando novo admin ${email}...`);
        const { error } = await supabase.from("platform_admins").insert({
            email,
            password_hash: passwordHash,
            full_name: fullName,
            is_active: true,
        });
        if (error) {
            console.error("Erro ao inserir:", error);
            process.exit(1);
        }
        console.log("Criado com sucesso.");
    }

    console.log("");
    console.log("===================================================");
    console.log("Pronto. Acesse /admin/login e entre com:");
    console.log(`  Email: ${email}`);
    console.log(`  Senha: (a que voce definiu em ADMIN_INITIAL_PASSWORD)`);
    console.log("");
    console.log("LEMBRE-SE: remover ADMIN_INITIAL_* do .env.local apos teste.");
    console.log("===================================================");
})();
