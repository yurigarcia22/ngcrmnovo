export type ColdLeadStatus = 'novo_lead' | 'lead_qualificado' | 'ligacao_feita' | 'contato_realizado' | 'contato_decisor' | 'reuniao_marcada' | 'numero_inexistente';

export interface ColdLead {
    id: string;
    created_at: string;
    updated_at: string;
    tenant_id: string;
    nome: string;
    responsavel_id?: string | null;
    telefone: string;
    google_meu_negocio_url?: string | null;
    site_url?: string | null;
    instagram_url?: string | null;
    nicho: string;
    status: ColdLeadStatus;
    tentativas: number;
    proxima_ligacao?: string | null;
    ultima_interacao?: string | null;
    ultimo_resultado?: string | null;
    notas?: string | null;
}

export interface ColdLeadInsert {
    tenant_id?: string;
    nome: string;
    responsavel_id?: string | null;
    telefone: string;
    google_meu_negocio_url?: string | null;
    site_url?: string | null;
    instagram_url?: string | null;
    nicho: string;
    status?: ColdLeadStatus;
    tentativas?: number;
    proxima_ligacao?: string | null;
    ultima_interacao?: string | null;
    ultimo_resultado?: string | null;
    notas?: string | null;
}

export interface ColdLeadUpdate extends Partial<ColdLeadInsert> { }
