/**
 * Diagnostico aprofundado da Prospeccao Inteligente.
 *
 * Raio-x comercial de consultor (o conteudo do PDF que vai pro lead), em 4 camadas:
 * leitura de mercado do nicho, diagnostico comercial (funil), o gap, e a PROVA
 * (case real do Grupo NG no mesmo nicho, vindo da biblioteca de cases).
 * Reusa a pesquisa profunda do enrich (Receita + analise de site).
 */

import { consultarCnpj, analisarSite, montarFicha, extrairSocio, type LeadParaEnriquecer } from "./enrich";

const OPENAI_MODEL = process.env.PROSPECT_OPENAI_MODEL || "gpt-4o";

/** Nome de arquivo seguro pro PDF do diagnostico. */
export function slugFile(empresa: string): string {
    const base = (empresa || "empresa")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return "Diagnostico-" + (base || "empresa") + ".pdf";
}

export interface CaseNG {
    nicho: string;
    cliente: string | null;
    cliente_publico: boolean;
    headline: string;
    metrica: string;
    valor_antes: string | null;
    valor_depois: string | null;
    prazo: string | null;
    o_que_fizemos: string | null;
}

export interface EixoDiagnostico {
    nome: string;
    nota: number; // 0-10
    status: "critico" | "atencao" | "bom";
    achado: string;
    recomendacao: string;
}

export interface ProvaSocial {
    titulo: string;      // ex: "Cruzeiro do Sul" ou "Instituicao de pos-graduacao"
    metrica: string;
    de: string;
    para: string;
    prazo: string;
    o_que_fizemos: string;
}

export interface Diagnostico {
    nota_geral: number; // 0-100
    veredito: string;
    resumo_executivo: string;
    contexto_mercado: string;             // leitura do setor (camada 1)
    eixos: EixoDiagnostico[];             // diagnostico comercial e digital (camada 2)
    oportunidade_central: { titulo: string; texto: string };
    plano: { passo: number; titulo: string; descricao: string; prazo: string }[];
    prova_social: ProvaSocial | null;    // case real do NG (camada 4)
}

// Escolhe o case mais relevante pro nicho do lead (match por palavra-chave).
export function escolherCase(nichoLead: string, cases: CaseNG[]): CaseNG | null {
    if (!cases || cases.length === 0) return null;
    const n = (nichoLead || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const grupos: Record<string, string[]> = {
        educacao: ["educ", "ensino", "faculdade", "universidade", "pos", "graduacao", "escola", "curso", "vestibular", "aluno", "matricula"],
        saude: ["saude", "clinica", "odonto", "medic", "estetica", "consultorio", "hospital"],
        varejo: ["varejo", "loja", "comercio", "moda", "confec", "vestuario", "atacado"],
        servico: ["servico", "consultoria", "advocacia", "contabil", "agencia"],
    };
    let grupoLead = "";
    for (const [g, kws] of Object.entries(grupos)) if (kws.some((k) => n.includes(k))) { grupoLead = g; break; }

    // 1) case cujo nicho bate diretamente com o do lead
    const direto = cases.find((c) => {
        const cn = (c.nicho || "").toLowerCase();
        return n.includes(cn) || cn.includes(n) || (grupoLead && (grupos[grupoLead] || []).some((k) => cn.includes(k)));
    });
    if (direto) return direto;
    return null; // sem case do mesmo nicho: melhor nao forcar prova social de outro setor
}

const SYSTEM_DIAG = [
    "Voce e consultor comercial senior do Grupo NG (assessoria de marketing e vendas que aumenta faturamento e taxa de conversao de empresas). Vai produzir um DIAGNOSTICO COMERCIAL aprofundado, do tipo que se apresenta numa reuniao de fechamento, a partir dos dados publicos reais coletados (Receita Federal e analise tecnica do site).",
    "",
    "NIVEL: consultor senior, nao estagiario de agencia. PROIBIDO conselho obvio e generico como 'faca um site', 'esteja nas redes sociais', 'diversifique canais', 'crie conteudo'. Fale como quem entende de FUNIL, CUSTO DE AQUISICAO, TAXA DE CONVERSAO, CICLO DE DECISAO e PROCESSO COMERCIAL. Cada ponto liga um fato a dinheiro.",
    "",
    "Estruture o diagnostico em camadas:",
    "1. LEITURA DE MERCADO DO NICHO: como funciona a captacao e a venda nesse setor especifico, onde a concorrencia ganha, qual o gargalo tipico. Especifico do nicho, nao generico.",
    "2. DIAGNOSTICO COMERCIAL E DIGITAL: onde o funil dessa empresa provavelmente vaza (do trafego ate o fechamento), com base no que a pesquisa mostrou.",
    "3. O GAP: onde ela esta hoje e o que esta deixando de faturar por causa disso.",
    "",
    "Produza um JSON com EXATAMENTE estas chaves:",
    "- nota_geral: inteiro 0 a 100 (maturidade comercial/digital; criterioso, maioria das PMEs fica 25 a 55).",
    "- veredito: 1 frase direta e honesta (foco comercial, nao so digital).",
    "- resumo_executivo: 2 a 3 frases, tom de consultor falando com o dono, ja apontando onde esta o dinheiro perdido.",
    "- contexto_mercado: 2 a 4 frases com a LEITURA DE MERCADO do nicho (camada 1). Dinamicas reais do setor, gargalo tipico de captacao/venda. Nada de numero de mercado inventado.",
    "- eixos: array de 4 a 5 eixos. Priorize eixos COMERCIAIS: 'Aquisicao e Trafego', 'Funil e Conversao', 'Processo Comercial e Follow-up', 'Autoridade e Prova', 'Rastreamento e Dados'. Cada eixo: { nome, nota (0 a 10), status (critico|atencao|bom), achado (o que os dados mostram, ligado a dinheiro), recomendacao (acao concreta de consultor, nunca obvia) }.",
    "- oportunidade_central: { titulo, texto (2 frases sobre a maior alavanca de faturamento destravavel agora, em termos de conversao/receita) }.",
    "- plano: array de 3 passos { passo (1,2,3), titulo, descricao (1 frase), prazo }.",
    "",
    "Se for fornecido um CASE do Grupo NG no mesmo nicho, voce PODE referenciar no resumo ou na oportunidade que ja obtivemos esse tipo de resultado no setor, mas NUNCA altere os numeros do case nem invente novos.",
    "",
    "REGRAS: proibido inventar numero ou metrica que nao esteja na ficha ou no case. Base tudo em dado real. Sem travessao. Portugues do Brasil. Responda SOMENTE o JSON.",
].join("\n");

export async function gerarDiagnostico(
    lead: LeadParaEnriquecer,
    cases: CaseNG[] = []
): Promise<{ diagnostico: Diagnostico; socio: string; raw: Record<string, unknown> }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada.");

    const [receita, site] = await Promise.all([
        lead.cnpj ? consultarCnpj(lead.cnpj) : Promise.resolve(null),
        analisarSite(lead.site || ""),
    ]);
    const socio = extrairSocio(receita);
    const ficha = montarFicha(lead, receita, site);
    const caseNicho = escolherCase(lead.nicho || String((ficha as any).nicho || ""), cases);

    const userContent =
        "FICHA DA EMPRESA (dados reais coletados):\n" + JSON.stringify(ficha, null, 2) +
        (caseNicho
            ? "\n\nCASE REAL DO GRUPO NG NESTE NICHO (nao altere os numeros):\n" + JSON.stringify({
                  cliente: caseNicho.cliente_publico ? caseNicho.cliente : "instituicao do mesmo segmento",
                  metrica: caseNicho.metrica, de: caseNicho.valor_antes, para: caseNicho.valor_depois,
                  prazo: caseNicho.prazo, o_que_fizemos: caseNicho.o_que_fizemos,
              }, null, 2)
            : "");

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
                    { role: "user", content: userContent },
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

    const prova: ProvaSocial | null = caseNicho
        ? {
              titulo: caseNicho.cliente_publico && caseNicho.cliente ? caseNicho.cliente : "Cliente do mesmo segmento",
              metrica: caseNicho.metrica,
              de: caseNicho.valor_antes || "",
              para: caseNicho.valor_depois || "",
              prazo: caseNicho.prazo || "",
              o_que_fizemos: caseNicho.o_que_fizemos || "",
          }
        : null;

    const diagnostico: Diagnostico = {
        nota_geral: Math.max(0, Math.min(100, Math.round(Number(p.nota_geral) || 0))),
        veredito: String(p.veredito || ""),
        resumo_executivo: String(p.resumo_executivo || ""),
        contexto_mercado: String(p.contexto_mercado || ""),
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
        prova_social: prova,
    };

    return { diagnostico, socio, raw: { receita: receita || null, site, case_usado: caseNicho?.headline || null } };
}
