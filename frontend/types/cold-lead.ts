export type ColdLeadStatus =
    | 'novo_lead'
    | 'novo'
    | 'tentativa_inicial'
    | 'lead_qualificado'
    | 'ligacao_feita'
    | 'contato_realizado'
    | 'contato_decisor'
    | 'em_follow_up'
    | 'aguardando_retorno'
    | 'sem_interesse'
    | 'nao_consegui_contato'
    | 'perdido'
    | 'convertido'
    | 'reuniao_marcada'
    | 'numero_inexistente';

export interface ColdCallFollowup {
    id: string;
    cold_lead_id: string;
    responsavel_id?: string | null;
    tenant_id: string;
    data_agendada: string;
    periodo: 'manha' | 'tarde' | 'noite' | 'qualquer';
    horario_especifico?: string | null;
    tipo_acao: 'ligacao' | 'whatsapp' | 'email' | 'retorno_prometido' | 'nova_tentativa';
    objetivo?: string | null;
    prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
    status: 'pendente' | 'concluido' | 'atrasado' | 'reagendado' | 'cancelado';
    created_at: string;
    updated_at: string;

    // Joint associations
    cold_leads?: Partial<ColdLead>;
    profiles?: any;
}


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
    email?: string | null;
    custom_fields?: Record<string, any>;
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
    email?: string | null;
    custom_fields?: Record<string, any>;
}

export interface ColdLeadUpdate extends Partial<ColdLeadInsert> { }
