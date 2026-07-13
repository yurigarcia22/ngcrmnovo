/**
 * Camada de pesquisa da Prospeccao Inteligente.
 *
 * Dado um lead (empresa com CNPJ e/ou site), enriquece com dados publicos e
 * gera um DOSSIE com observacoes concretas, dor, gancho, insight e a 1a
 * mensagem. Tudo baseado em fato: o prompt proibe inventar dado.
 *
 * Fontes: BrasilAPI (CNPJ + QSA/socios), texto do site. Geracao: OpenAI.
 * Sem dependencia de SDK: usa fetch nativo (Node 20).
 *
 * Env:
 *   OPENAI_API_KEY        (obrigatoria)
 *   PROSPECT_OPENAI_MODEL (opcional, default "gpt-4o")
 */

const OPENAI_MODEL = process.env.PROSPECT_OPENAI_MODEL || "gpt-4o";

export interface DossieLead {
    observacoes: string[];
    dor: string;
    gancho: string;
    insight_gratis: string;
    mensagem_1: string;
}

export interface LeadParaEnriquecer {
    empresa: string;
    cnpj?: string | null;
    site?: string | null;
    instagram?: string | null;
    cidade?: string | null;
    nicho?: string | null;
}

export interface ResultadoEnriquecimento {
    socio: string;
    dossie: DossieLead;
    raw: Record<string, unknown>;
}

async function fetchComTimeout(url: string, opts: RequestInit = {}, ms = 15000): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

/** Consulta CNPJ na BrasilAPI com 1 retry (a API oscila). Retorna o objeto da receita ou null. */
export async function consultarCnpj(cnpj: string): Promise<Record<string, any> | null> {
    const digits = (cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) return null;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
        try {
            const r = await fetchComTimeout(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
            if (r.ok) {
                const j = await r.json();
                if (j && j.razao_social) return j;
            }
        } catch {
            // tenta de novo
        }
        if (tentativa === 0) await new Promise((res) => setTimeout(res, 2000));
    }
    return null;
}

/** Baixa o site e extrai texto limpo (ate ~4000 chars). Tolerante a falha. */
export async function extrairTextoSite(site: string): Promise<string> {
    if (!site) return "";
    let url = site.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
        const r = await fetchComTimeout(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; NGProspect/1.0)" } });
        if (!r.ok) return "";
        const html = await r.text();
        return html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 4000);
    } catch {
        return "";
    }
}

/** Extrai o primeiro nome do socio-administrador a partir do QSA da receita. */
export function extrairSocio(receita: Record<string, any> | null): string {
    const qsa: any[] = (receita && receita.qsa) || [];
    if (!qsa.length) return "";
    const adm = qsa.find((s) => String(s.qualificacao_socio || "").toLowerCase().includes("administrador")) || qsa[0];
    const nome = (adm && (adm.nome_socio || adm.nome)) || "";
    if (!nome) return "";
    const primeiro = String(nome).trim().split(/\s+/)[0].toLowerCase();
    return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
}

const SYSTEM_PROMPT = [
    "Voce e analista comercial do Grupo NG, assessoria de marketing e vendas do Yuri Garcia.",
    "Com base na ficha da empresa, produza um JSON com exatamente estas chaves:",
    '- "observacoes": array com 3 observacoes concretas e verificaveis sobre a presenca comercial/digital da empresa. Nada generico, nada de elogio vazio. Cada observacao cita um fato da ficha.',
    '- "dor": a dor provavel que essas observacoes indicam (1 frase).',
    '- "gancho": qual das 3 observacoes e a mais forte pra abrir conversa (copie o texto dela).',
    '- "insight_gratis": 1 insight acionavel que podemos entregar de graca na conversa.',
    '- "mensagem_1": a primeira mensagem de WhatsApp, seguindo EXATAMENTE esta estrutura: saudacao com o primeiro nome do socio (se houver; senao cumprimente o responsavel pela empresa) + "Aqui e o Yuri, do Grupo NG" + o gancho em linguagem natural + 1 frase curta sobre o que a NG faz + loop aberto ("notei mais 2 pontos alem desse") + pergunta final curta. Escreva com pontuacao natural de conversa (virgulas, pontos e interrogacao), nunca frases emendadas sem pontuacao. Sem link. Sem travessao. Maximo 450 caracteres. Tom brasileiro informal-profissional, soando 100% humano, nunca robotico.',
    "REGRA ABSOLUTA: proibido inventar dados. Se a informacao nao esta na ficha, nao use. NUNCA transforme a ausencia de um dado em observacao (nada de 'nao foi possivel consultar o CNPJ' ou 'nao ha dados sobre seguidores'); observacao e so sobre o que EXISTE na ficha. Se faltar dado do site, baseie as observacoes no que existir (receita, instagram, nicho). Responda SOMENTE o JSON.",
].join("\n");

/** Chama a OpenAI para gerar o dossie a partir da ficha consolidada. */
async function gerarDossie(ficha: Record<string, unknown>): Promise<DossieLead> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada.");

    const r = await fetchComTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: OPENAI_MODEL,
                temperature: 0.7,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: "FICHA DA EMPRESA:\n" + JSON.stringify(ficha, null, 2) },
                ],
            }),
        },
        60000
    );

    if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`OpenAI ${r.status}: ${txt.slice(0, 300)}`);
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI retornou resposta vazia.");

    let parsed: any;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error("OpenAI retornou JSON invalido.");
    }

    return {
        observacoes: Array.isArray(parsed.observacoes) ? parsed.observacoes.map(String) : [],
        dor: String(parsed.dor || ""),
        gancho: String(parsed.gancho || ""),
        insight_gratis: String(parsed.insight_gratis || ""),
        mensagem_1: String(parsed.mensagem_1 || ""),
    };
}

/**
 * Orquestra o enriquecimento completo de um lead: consulta CNPJ, le o site,
 * monta a ficha e gera o dossie. Lanca erro se a geracao falhar.
 */
export async function enriquecerLead(lead: LeadParaEnriquecer): Promise<ResultadoEnriquecimento> {
    const [receita, textoSite] = await Promise.all([
        lead.cnpj ? consultarCnpj(lead.cnpj) : Promise.resolve(null),
        lead.site ? extrairTextoSite(lead.site) : Promise.resolve(""),
    ]);

    const socio = extrairSocio(receita);

    const ficha: Record<string, unknown> = {
        empresa: lead.empresa || receita?.nome_fantasia || receita?.razao_social || "",
        nicho: lead.nicho || receita?.cnae_fiscal_descricao || "",
        cidade: lead.cidade || receita?.municipio || "",
        instagram: lead.instagram || "",
        socio_primeiro_nome: socio,
        dados_receita: receita
            ? {
                  razao_social: receita.razao_social,
                  nome_fantasia: receita.nome_fantasia,
                  porte: receita.porte,
                  atividade_principal: receita.cnae_fiscal_descricao,
                  abertura: receita.data_inicio_atividade,
                  capital_social: receita.capital_social,
                  socios: ((receita.qsa as any[]) || []).map((s) => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })),
              }
            : "CNPJ nao consultado ou invalido",
        texto_site: textoSite || "site nao disponivel",
    };

    const dossie = await gerarDossie(ficha);

    return {
        socio,
        dossie,
        raw: { receita: receita || null, texto_site_len: textoSite.length, modelo: OPENAI_MODEL },
    };
}
