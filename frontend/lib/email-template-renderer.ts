// ============================================================
// Email Template Renderer — Merge Tag Engine
// ============================================================

export interface TemplateContext {
    nome?: string;
    primeiro_nome?: string;
    empresa?: string;
    email?: string;
    telefone?: string;
    cargo?: string;
    responsavel?: string;
    produto?: string;
    link_reuniao?: string;
    link_proposta?: string;
    cidade?: string;
    origem_lead?: string;
    etapa?: string;
    organizacao_nome?: string;
    [key: string]: string | undefined;
}

const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Get the list of all supported template variables
 */
export function getAvailableVariables(): { key: string; label: string; example: string }[] {
    return [
        { key: 'nome', label: 'Nome Completo', example: 'João Silva' },
        { key: 'primeiro_nome', label: 'Primeiro Nome', example: 'João' },
        { key: 'empresa', label: 'Empresa', example: 'Acme Corp' },
        { key: 'email', label: 'E-mail', example: 'joao@acme.com' },
        { key: 'telefone', label: 'Telefone', example: '(11) 99999-0000' },
        { key: 'cargo', label: 'Cargo', example: 'Gerente Comercial' },
        { key: 'responsavel', label: 'Responsável', example: 'Maria Santos' },
        { key: 'produto', label: 'Produto/Serviço', example: 'Plano Pro' },
        { key: 'link_reuniao', label: 'Link da Reunião', example: 'https://meet.google.com/...' },
        { key: 'link_proposta', label: 'Link da Proposta', example: 'https://crm.com/proposta/...' },
        { key: 'cidade', label: 'Cidade', example: 'São Paulo' },
        { key: 'origem_lead', label: 'Origem do Lead', example: 'Website' },
        { key: 'etapa', label: 'Etapa Atual', example: 'Qualificação' },
        { key: 'organizacao_nome', label: 'Nome da Organização', example: 'Minha Empresa' },
    ];
}

/**
 * Extract all variable names from a template string
 */
export function extractVariables(content: string): string[] {
    const variables: string[] = [];
    let match;
    while ((match = VARIABLE_REGEX.exec(content)) !== null) {
        if (!variables.includes(match[1])) {
            variables.push(match[1]);
        }
    }
    return variables;
}

/**
 * Validate which variables in content are missing from the context
 */
export function validateVariables(content: string, context: TemplateContext): { missing: string[]; found: string[] } {
    const vars = extractVariables(content);
    const missing: string[] = [];
    const found: string[] = [];

    for (const v of vars) {
        if (context[v] !== undefined && context[v] !== '') {
            found.push(v);
        } else {
            missing.push(v);
        }
    }

    return { missing, found };
}

/**
 * Render a template string by replacing merge tags with context values
 */
export function renderTemplate(content: string, context: TemplateContext, options?: { emptyFallback?: string }): string {
    const fallback = options?.emptyFallback ?? '';

    return content.replace(VARIABLE_REGEX, (fullMatch, varName) => {
        const value = context[varName];
        if (value !== undefined && value !== '') {
            return value;
        }
        return fallback;
    });
}
