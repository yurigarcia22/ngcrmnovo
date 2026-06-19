/**
 * Vocabulario por modulo. Quando o modulo 'veterinaria' esta ligado, o produto
 * fala a lingua de uma clinica (Tutor/Atendimento) em vez da lingua de vendas
 * (Lead/Negocio). Centralizado aqui para nao espalhar troca de texto cega pelas
 * telas — quem usa o CRM de vendas continua vendo a terminologia de vendas.
 */

export type VocabMode = "sales" | "vet";

export interface Vocab {
    mode: VocabMode;
    /** Titulo da secao de navegacao (sidebar). */
    commercialSection: string;
    /** Rotulo do item de navegacao do Kanban (/leads). */
    leadsNav: string;
    /** Titulo da tela /leads. */
    pipeline: string;
    /** Frase de ajuda na coluna de entrada do Kanban. */
    newLeadsHint: string;
    /** Como chamar o "negocio"/card do Kanban. */
    dealWord: string;
    /** Rotulo de faturamento/receita. */
    revenue: string;
}

const SALES: Vocab = {
    mode: "sales",
    commercialSection: "Comercial",
    leadsNav: "Leads",
    pipeline: "Pipeline de Vendas",
    newLeadsHint: "Conversas novas chegam aqui. Arraste para promover a deal.",
    dealWord: "Negócio",
    revenue: "Receita ganha",
};

const VET: Vocab = {
    mode: "vet",
    commercialSection: "Captação",
    leadsNav: "Captação",
    pipeline: "Funil de Atendimento",
    newLeadsHint: "Tutores novos chegam aqui. Arraste conforme o atendimento avança.",
    dealWord: "Atendimento",
    revenue: "Faturamento",
};

export function getVocab(vetOn: boolean): Vocab {
    return vetOn ? VET : SALES;
}
