/**
 * Camada de feature flags por tenant.
 *
 * Cada modulo do CRM e identificado por uma chave canonica. Os flags
 * vivem na tabela tenant_modules e sao gerenciados via /admin.
 *
 * Quem precisa saber se um modulo esta ligado:
 *  - Sidebar (renderiza condicional)
 *  - Middleware (bloqueia rota)
 *  - Server actions (assertModule no topo de cada action)
 *  - Pages server-side (defesa em profundidade)
 */

import { createClient } from "@supabase/supabase-js";

// =====================================================================
// Definicoes canonicas
// =====================================================================

export const MODULE_KEYS = [
    "dashboard",
    "leads",
    "chat",
    "cold_call",
    "webinar",
    "emails",
    "whatsapp_connect",
    "veterinaria",
    "disparos",
    "prospeccao",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleMeta {
    key: ModuleKey;
    label: string;
    description: string;
    /** Rotas que este modulo controla (usado pelo middleware). */
    routes: string[];
    /** Ligado por default em tenant novo? */
    defaultEnabled: boolean;
}

export const MODULE_REGISTRY: Record<ModuleKey, ModuleMeta> = {
    dashboard: {
        key: "dashboard",
        label: "Dashboard",
        description: "Painel inicial com metricas do funil e desempenho.",
        routes: ["/dashboard"],
        defaultEnabled: true,
    },
    leads: {
        key: "leads",
        label: "Leads (Kanban)",
        description: "Pipeline de negociacoes em formato Kanban.",
        routes: ["/leads"],
        defaultEnabled: true,
    },
    chat: {
        key: "chat",
        label: "Conversas (WhatsApp)",
        description: "Caixa de conversas via WhatsApp.",
        routes: ["/chat"],
        defaultEnabled: true,
    },
    cold_call: {
        key: "cold_call",
        label: "Cold Call",
        description: "Modulo de prospeccao ativa por telefone.",
        routes: ["/cold-call"],
        defaultEnabled: false,
    },
    webinar: {
        key: "webinar",
        label: "Webinar",
        description: "Campanhas de webinar com prospeccao automatizada.",
        routes: ["/webinar"],
        defaultEnabled: false,
    },
    emails: {
        key: "emails",
        label: "E-mails",
        description: "Caixa de e-mail integrada (SMTP/IMAP).",
        routes: ["/emails"],
        defaultEnabled: false,
    },
    whatsapp_connect: {
        key: "whatsapp_connect",
        label: "Conexao WhatsApp",
        description: "Gerenciamento de instancias do WhatsApp em settings.",
        routes: ["/settings/whatsapp"],
        defaultEnabled: true,
    },
    veterinaria: {
        key: "veterinaria",
        label: "Clinica Veterinaria",
        description: "Vertical pet: agenda de atendimentos, cadastro de pets por tutor, carteira de vacinas e lembretes automaticos via WhatsApp.",
        routes: ["/agenda", "/pets"],
        defaultEnabled: false,
    },
    disparos: {
        key: "disparos",
        label: "Disparos WhatsApp",
        description: "Prospeccao: campanhas de disparo em massa pelo numero conectado, com delay, cap diario e variacoes de mensagem.",
        routes: ["/disparos"],
        defaultEnabled: false,
    },
    prospeccao: {
        key: "prospeccao",
        label: "Prospeccao Inteligente",
        description: "Camada de pesquisa: enriquece a empresa (CNPJ, socios, site) e gera um dossie com observacoes reais, gancho e a 1a mensagem, antes de abordar.",
        routes: ["/prospeccao"],
        defaultEnabled: false,
    },
};

export type TenantModulesMap = Record<ModuleKey, boolean>;

// =====================================================================
// Helpers
// =====================================================================

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } }
    );
}

/**
 * Le todos os flags de um tenant.
 * Se algum modulo nao tiver registro (tenant antigo, modulo novo
 * adicionado depois), assume defaultEnabled do MODULE_REGISTRY.
 */
export async function getTenantModules(tenantId: string): Promise<TenantModulesMap> {
    const supabase = getServiceClient();
    const { data, error } = await supabase
        .from("tenant_modules")
        .select("module_key, enabled")
        .eq("tenant_id", tenantId);

    if (error) {
        console.error("[modules] Erro ao buscar tenant_modules:", error);
        // Em caso de erro, retorna default seguro
        return Object.fromEntries(
            MODULE_KEYS.map((k) => [k, MODULE_REGISTRY[k].defaultEnabled])
        ) as TenantModulesMap;
    }

    const map: Partial<TenantModulesMap> = {};
    for (const row of data ?? []) {
        if (MODULE_KEYS.includes(row.module_key as ModuleKey)) {
            map[row.module_key as ModuleKey] = row.enabled;
        }
    }

    // Preenche modulos ausentes com default
    for (const key of MODULE_KEYS) {
        if (map[key] === undefined) {
            map[key] = MODULE_REGISTRY[key].defaultEnabled;
        }
    }

    return map as TenantModulesMap;
}

/**
 * Verifica se um modulo esta ligado para um tenant especifico.
 */
export async function isModuleEnabled(
    tenantId: string,
    moduleKey: ModuleKey
): Promise<boolean> {
    const modules = await getTenantModules(tenantId);
    return modules[moduleKey] === true;
}

/**
 * Throw se o modulo nao estiver ligado. Use no topo de server actions
 * que pertencem a um modulo opt-in (cold_call, webinar, emails).
 *
 * Exemplo:
 *   export async function getColdLeads() {
 *     const tenantId = await getTenantId();
 *     await assertModule(tenantId, "cold_call");
 *     ...
 *   }
 */
export async function assertModule(
    tenantId: string,
    moduleKey: ModuleKey
): Promise<void> {
    const enabled = await isModuleEnabled(tenantId, moduleKey);
    if (!enabled) {
        throw new Error(
            `Modulo "${moduleKey}" nao esta ativo para este tenant. ` +
            "Contate o administrador da plataforma."
        );
    }
}

/**
 * Atualiza o flag de um modulo para um tenant (uso exclusivo do /admin).
 *
 * @param adminId  Id do super-admin que esta fazendo a mudanca (auditoria).
 */
export async function setTenantModule(
    tenantId: string,
    moduleKey: ModuleKey,
    enabled: boolean,
    adminId: string
): Promise<void> {
    const supabase = getServiceClient();
    const { error } = await supabase
        .from("tenant_modules")
        .upsert(
            {
                tenant_id: tenantId,
                module_key: moduleKey,
                enabled,
                updated_by: adminId,
            },
            { onConflict: "tenant_id,module_key" }
        );

    if (error) {
        throw new Error(`Falha ao atualizar modulo: ${error.message}`);
    }
}

/**
 * Util para mapear path -> modulo, usado no middleware para bloquear
 * rotas de modulos desligados.
 */
export function findModuleByPath(path: string): ModuleKey | null {
    for (const meta of Object.values(MODULE_REGISTRY)) {
        for (const route of meta.routes) {
            if (path === route || path.startsWith(route + "/")) {
                return meta.key;
            }
        }
    }
    return null;
}
