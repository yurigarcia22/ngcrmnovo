/**
 * Guard server-side para layouts de modulos opt-in.
 *
 * Verifica se o modulo esta ativo para o tenant logado e redireciona
 * para /module-disabled se nao estiver.
 *
 * Uso em layout.tsx de cada modulo opt-in:
 *
 *   import { guardModule } from "@/lib/guard-module";
 *
 *   export default async function WebinarLayout({ children }) {
 *     await guardModule("webinar");
 *     return <>{children}</>;
 *   }
 */

import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant-context";
import { MODULE_REGISTRY, type ModuleKey } from "@/lib/modules";

export async function guardModule(moduleKey: ModuleKey): Promise<void> {
    const ctx = await getTenantContext();
    if (!ctx) {
        redirect("/login");
    }

    if (!ctx.modules[moduleKey]) {
        const label = encodeURIComponent(MODULE_REGISTRY[moduleKey].label);
        redirect(`/module-disabled?module=${label}`);
    }
}
