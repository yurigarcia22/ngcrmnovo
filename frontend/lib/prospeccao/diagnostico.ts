/**
 * Diagnostico aprofundado da Prospeccao Inteligente.
 *
 * Gera um raio-x comercial estruturado por eixos (o conteudo do PDF que vai pro
 * lead). Reusa a mesma pesquisa profunda do enrich (Receita + analise de site).
 */

import { consultarCnpj, analisarSite, montarFicha, extrairSocio, type LeadParaEnriquecer } from "./enrich";

const OPENAI_MODEL = process.env.PROSPECT_OPENAI_MODEL || "gpt-4o";

/** Nome de arquivo seguro pro PDF do diagnostico (ex: Diagnostico-Deposito-Moda.pdf). */
export function slugFile(empresa: string): string {
    const base = (empresa || "empresa")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return "Diagnostico-" + (base || "empresa") + ".pdf";
}

export interface EixoDiagnostico {
    nome: string;
    nota: number; // 0-10
    status: "critico" | "atencao" | "bom";
    achado: string;
    recomendacao: string;
}

export interface Diagnostico {
    nota_geral: number; // 0-100
    veredito: string;
    resumo_executivo: string;
    eixos: EixoDiagnostico[];
    oportunidade_central: { titulo: string; texto: string };
    plano: { passo: number; titulo: string; descricao: string; prazo: string }[];
}

const SYSTEM_DIAG = [
    "Voce e consultor comercial senior do Grupo NG (assessoria de marketing e vendas). Vai produzir um DIAGNOSTICO COMERCIAL aprofundado desta empresa, do tipo que se entrega numa reuniao, a partir dos dados publicos reais coletados (Receita Federal e analise tecnica do site).",
    "",
    "Pense como dono de negocio e cruze os dados. Cada achado deve ligar um FATO concreto da ficha a uma CONSEQUENCIA em dinheiro/cliente, e cada recomendacao deve ser especifica pra essa empresa (nunca conselho generico).",
    "",
    "Produza um JSON com EXATAMENTE estas chaves:",
    '- "nota_geral": numero inteiro de 0 a 100 (maturidade comercial/digital da empresa; seja realista e criterioso, a maioria das PMEs fica entre 25 e 55).',
    '- "veredito": 1 frase direta e honesta resumindo o estado (ex: "Negocio solido no operacional, mas invisivel na aquisicao digital").',
    '- "resumo_executivo": 2 a 3 frases com o quadro geral, em tom de consultor falando com o dono.',
    '- "eixos": array de 4 a 5 eixos avaliados. Eixos sugeridos (adapte ao caso): "Presenca Digital", "Aquisicao de Clientes", "Site e Conversao", "Rastreamento e Dados", "Relacionamento e Retencao". Cada eixo: { "nome", "nota" (0 a 10), "status" ("critico" | "atencao" | "bom"), "achado" (o que os dados mostram, especifico), "recomendacao" (acao concreta pra essa empresa) }.',
    '- "oportunidade_central": { "titulo": frase curta, "texto": 2 frases sobre a maior alavanca de faturamento destravavel agora }.',
    '- "plano": array de 3 passos { "passo" (1,2,3), "titulo", "descricao" (1 frase), "prazo" (ex: "primeiros 30 dias") } em ordem de prioridade.',
    "",
    "REGRAS: proibido inventar numero ou metrica que nao esteja na ficha (nada de percentuais fictícios ou numero de seguidores). Base tudo nos dados reais. Sem travessao. Portugues do Brasil. Responda SOMENTE o JSON.",
].join("\n");

export async function gerarDiagnostico(lead: LeadParaEnriquecer): Promise<{ diagnostico: Diagnostico; socio: string; raw: Record<string, unknown> }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada.");

    const [receita, site] = await Promise.all([
        lead.cnpj ? consultarCnpj(lead.cnpj) : Promise.resolve(null),
        analisarSite(lead.site || ""),
    ]);
    const socio = extrairSocio(receita);
    const ficha = montarFicha(lead, receita, site);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 90000);
    let r: Response;
    try {
        r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
            body: JSON.stringify({
                model: OPENAI_MODEL,
                temperature: 0.6,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: SYSTEM_DIAG },
                    { role: "user", content: "FICHA DA EMPRESA (dados reais coletados):\n" + JSON.stringify(ficha, null, 2) },
                ],
            }),
        });
    } finally {
        clearTimeout(t);
    }
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
    const content = (await r.json())?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI retornou vazio.");

    let p: any;
    try { p = JSON.parse(content); } catch { throw new Error("JSON invalido do diagnostico."); }

    const diagnostico: Diagnostico = {
        nota_geral: Math.max(0, Math.min(100, Math.round(Number(p.nota_geral) || 0))),
        veredito: String(p.veredito || ""),
        resumo_executivo: String(p.resumo_executivo || ""),
        eixos: Array.isArray(p.eixos) ? p.eixos.slice(0, 6).map((e: any) => ({
            nome: String(e.nome || ""),
            nota: Math.max(0, Math.min(10, Math.round(Number(e.nota) || 0))),
            status: ["critico", "atencao", "bom"].includes(e.status) ? e.status : "atencao",
            achado: String(e.achado || ""),
            recomendacao: String(e.recomendacao || ""),
        })) : [],
        oportunidade_central: {
            titulo: String(p.oportunidade_central?.titulo || ""),
            texto: String(p.oportunidade_central?.texto || ""),
        },
        plano: Array.isArray(p.plano) ? p.plano.slice(0, 5).map((x: any, i: number) => ({
            passo: Number(x.passo) || i + 1,
            titulo: String(x.titulo || ""),
            descricao: String(x.descricao || ""),
            prazo: String(x.prazo || ""),
        })) : [],
    };

    return { diagnostico, socio, raw: { receita: receita || null, site } };
}
