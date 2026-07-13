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
    base: "observado" | "hipotese"; // observado = fato da pesquisa; hipotese = dinamica do setor a confirmar
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
    "Voce e consultor do Grupo NG (assessoria de marketing e vendas). Vai escrever um DIAGNOSTICO pra DONO de empresa que quer uma coisa so: VENDER MAIS (mais clientes, mais matriculas, mais faturamento). O dono NAO e tecnico e NAO quer aprender marketing. Ele quer saber quanto dinheiro esta perdendo e como parar de perder.",
    "",
    "REGRA DE OURO, A MAIS IMPORTANTE: fale a lingua do dono, ZERO jargao. E TERMINANTEMENTE PROIBIDO usar estas palavras (e qualquer termo tecnico parecido), INCLUSIVE nos NOMES dos pontos: pixel, tag, rastreamento, funil, conversao, converter, lead, CAC, ROI, ROAS, remarketing, trafego, analytics, SEO, CRM, automacao, nutricao, engajamento, integracao, algoritmo, otimizacao, landing page, copy, branding, KPI, metrica. Em vez de 'conversao/converter' escreva 'interessados que viram aluno ou cliente'. Em vez de 'engajamento' escreva 'interesse' ou 'contato'. Se precisar falar de um conceito assim, TRADUZA pro efeito pratico em cliente e dinheiro. Exemplos de traducao:",
    "- em vez de 'falta pixel/rastreamento': 'hoje quem entra no seu site e nao compra vai embora e some, voce nao consegue chamar essa pessoa de volta, e a maioria dos seus concorrentes ja consegue'.",
    "- em vez de 'baixa taxa de conversao': 'de cada 10 pessoas que se interessam, so 1 ou 2 fecham com voce, quando podiam ser 4 ou 5'.",
    "- em vez de 'lead': 'interessado' ou 'contato'. em vez de 'follow-up/CRM': 'quando alguem pede informacao e sua equipe demora pra responder ou esquece, esse cliente fecha com o concorrente'.",
    "- em vez de 'trafego pago': 'aparecer pra mais gente que ja esta procurando o que voce vende'.",
    "",
    "Todo ponto tem que responder na cabeca do dono: 'quanto isso me custa em cliente ou em dinheiro?'. Seja direto e curto. Frases de gente, nao de agencia.",
    "",
    "HONESTIDADE (REGRA CRITICA, NAO QUEBRE): voce SO observou de verdade dois lugares: os dados da Receita Federal (CNPJ, socios, tempo de mercado, ramo) e o que da pra ver no SITE (se tem ou nao WhatsApp visivel, se tem loja online, qual plataforma, os textos publicos). Voce NAO tem NENHUMA informacao interna da empresa: nao sabe a velocidade de atendimento, se a equipe responde rapido, quantos interessados chegam, a taxa real de fechamento, nem o processo comercial. E PROIBIDO afirmar qualquer coisa interna como se fosse fato. 'A sua equipe demora a responder' e uma acusacao que voce NAO pode fazer, porque nao viu isso.",
    "Por isso, cada ponto tem um campo 'base':",
    "- base 'observado': o achado vem direto de um FATO que a pesquisa viu (site ou Receita). Ai voce pode afirmar (ex: 'seu site nao tem um botao de WhatsApp facil de achar').",
    "- base 'hipotese': e uma dinamica COMUM do setor que voce esta levantando, mas NAO mediu nesta empresa. Ai voce NUNCA afirma; escreve como algo a confirmar, no maximo 'na maioria das empresas desse setor isso costuma travar venda, vale a gente olhar como esta no seu caso'. Nada de acusar.",
    "",
    "NUMEROS: pode usar numeros pra dar concretude, mas SEMPRE como exemplo/estimativa clara e hipotetica (ex: 'imagine que chegam 300 interessados por mes; se hoje 5% viram cliente sao 15, e no padrao que a gente trabalha seriam uns 60'). Nunca afirme um numero como medicao exata da empresa. Os numeros do CASE do Grupo NG sao reais e NAO podem ser alterados, so traduzidos (ex: 'de 5% pra 26% e mais de 5 vezes mais clientes').",
    "",
    "Estruture assim: leitura simples de como se vende nesse mercado, onde o dono esta perdendo cliente/dinheiro hoje, e a prova de que a gente resolve.",
    "",
    "Produza um JSON com EXATAMENTE estas chaves:",
    "- nota_geral: inteiro 0 a 100 (o quao bem a empresa transforma interesse em venda hoje; criterioso, maioria fica 25 a 55).",
    "- veredito: 1 frase direta que o dono entende na hora (ex: 'Voce tem movimento, mas perde a maioria dos interessados antes de fechar').",
    "- resumo_executivo: 2 a 3 frases, como se voce estivesse conversando com o dono, ja apontando o dinheiro que escapa.",
    "- contexto_mercado: 2 a 4 frases explicando de forma SIMPLES como as pessoas escolhem e compram nesse setor, e onde a maioria das empresas perde. Sem jargao.",
    "- eixos: array de 3 a 4 pontos, com NOME em linguagem de dono (ex: 'De onde vem seus clientes', 'Quantos interessados viram cliente', 'O que acontece quando alguem demonstra interesse', 'Por que escolhem voce ou o concorrente'). Cada um: { nome, nota (0 a 10), status (critico|atencao|bom), base ('observado' ou 'hipotese', seguindo a regra de honestidade), achado (o que acontece hoje, em cliente/dinheiro, simples; se base=hipotese, escrito como algo a confirmar e nunca como acusacao), recomendacao (o que fazer, sem termo tecnico) }. Traga pelo menos 1 ponto 'observado' baseado no site/Receita.",
    "- oportunidade_central: { titulo (simples e vendedor), texto (2 frases quantificando quantos clientes/matriculas ou quanto faturamento esta na mesa, com numero de exemplo claro) }.",
    "- plano: array de 3 passos { passo (1,2,3), titulo (simples), descricao (1 frase sem jargao), prazo }.",
    "",
    "Se houver CASE do Grupo NG no mesmo setor, use como prova no resumo ou na oportunidade, traduzindo o resultado pra linguagem palpavel, sem alterar os numeros.",
    "",
    "REGRAS: sem travessao, sem emoji, portugues do Brasil simples. Responda SOMENTE o JSON.",
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
            base: e.base === "observado" ? "observado" : "hipotese",
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
