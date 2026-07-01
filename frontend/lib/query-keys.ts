/**
 * Query keys centralizadas do CRM.
 *
 * Padrao TanStack Query: cada feature tem um objeto que produz arrays
 * hierarquicos. Invalidar `qk.deals.all` pega tudo de deals; invalidar
 * `qk.deals.board(pipelineId)` pega so um board especifico.
 */

export const qk = {
    deals: {
        all: ["deals"] as const,
        board: (pipelineId: string | null | undefined) => ["deals", "board", pipelineId] as const,
        byId: (id: string) => ["deals", "byId", id] as const,
    },
    pipelines: {
        all: ["pipelines"] as const,
        list: () => ["pipelines", "list"] as const,
    },
    coldCall: {
        all: ["coldCall"] as const,
        pipelines: () => ["coldCall", "pipelines"] as const,
        leads: (filters: Record<string, unknown>) => ["coldCall", "leads", filters] as const,
        stageCounts: (pipelineId: number | string | null | undefined, filters: Record<string, unknown>) =>
            ["coldCall", "stageCounts", pipelineId ?? null, filters] as const,
        stageLeads: (stageId: string, filters: Record<string, unknown>) =>
            ["coldCall", "stageLeads", stageId, filters] as const,
        followups: (status?: string) => ["coldCall", "followups", status ?? "all"] as const,
    },
    tasks: {
        all: ["tasks"] as const,
        mine: () => ["tasks", "mine"] as const,
    },
    conversations: {
        all: ["conversations"] as const,
        list: () => ["conversations", "list"] as const,
        byDeal: (dealId: string) => ["conversations", "byDeal", dealId] as const,
    },
    team: {
        all: ["team"] as const,
        members: () => ["team", "members"] as const,
    },
    fields: {
        definitions: () => ["fields", "definitions"] as const,
    },
    tags: {
        all: () => ["tags", "all"] as const,
    },
    notifications: {
        list: () => ["notifications", "list"] as const,
        settings: () => ["notifications", "settings"] as const,
    },
} as const;
