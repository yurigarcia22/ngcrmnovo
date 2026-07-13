/**
 * Camada de pesquisa da Prospeccao Inteligente.
 *
 * Dado um lead (empresa com CNPJ e/ou site), enriquece com dados publicos reais
 * (Receita Federal via BrasilAPI + analise tecnica do site) e gera um DOSSIE de
 * consultor: observacoes especificas, dor, gancho, insight e a 1a mensagem.
 * O prompt proibe inventar dado: dossie so fala do que a pesquisa achou.
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

export interface SinaisSite {
    online: boolean;
    titulo: string;
    descricao: string;
    tem_pixel_meta: boolean;
    tem_ga_ou_gtm: boolean;
    tem_whatsapp: boolean;
    tem_loja_online: boolean;
    tem_form_captura: boolean;
    tem_blog: boolean;
    plataforma: string;
    paginas_lidas: string[];
    resumo_texto: string;
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
            const r = await fetchComTimeout(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; NGProspect/1.0)" },
            });
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

function limparHtml(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extrairTag(html: string, re: RegExp): string {
    const m = html.match(re);
    return m ? m[1].replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

/**
 * Analisa o site de verdade: le a home + ate 2 paginas internas, detecta sinais
 * tecnicos (pixel, analytics, WhatsApp, loja, captura, plataforma) e resume o texto.
 * Isso e o que separa um dossie de consultor de um dossie generico.
 */
export async function analisarSite(site: string): Promise<SinaisSite> {
    const vazio: SinaisSite = {
        online: false, titulo: "", descricao: "", tem_pixel_meta: false, tem_ga_ou_gtm: false,
        tem_whatsapp: false, tem_loja_online: false, tem_form_captura: false, tem_blog: false,
        plataforma: "", paginas_lidas: [], resumo_texto: "",
    };
    if (!site) return vazio;
    let base = site.trim();
    if (!/^https?:\/\//i.test(base)) base = "https://" + base;

    let homeHtml = "";
    try {
        const r = await fetchComTimeout(base, { headers: { "User-Agent": "Mozilla/5.0 (compatible; NGProspect/1.0)" } });
        if (!r.ok) return vazio;
        homeHtml = await r.text();
    } catch {
        return vazio;
    }

    const low = homeHtml.toLowerCase();
    const plataforma =
        /shopify/.test(low) ? "Shopify" :
        /woocommerce|wp-content/.test(low) ? (/(woocommerce)/.test(low) ? "WooCommerce" : "WordPress") :
        /nuvemshop|tiendanube/.test(low) ? "Nuvemshop" :
        /vtex/.test(low) ? "VTEX" :
        /wix\.com|wixstatic/.test(low) ? "Wix" :
        /squarespace/.test(low) ? "Squarespace" : "";

    const sinais: SinaisSite = {
        online: true,
        titulo: extrairTag(homeHtml, /<title[^>]*>([\s\S]*?)<\/title>/i),
        descricao: extrairTag(homeHtml, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i),
        tem_pixel_meta: /connect\.facebook\.net|fbq\(|facebook pixel/i.test(homeHtml),
        tem_ga_ou_gtm: /googletagmanager\.com|gtag\(|google-analytics\.com|ga\('create'/i.test(homeHtml),
        tem_whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp/i.test(homeHtml),
        tem_loja_online: /add[-_ ]?to[-_ ]?cart|adicionar ao carrinho|checkout|finalizar compra|meu carrinho|comprar agora/i.test(homeHtml) || !!plataforma.match(/Shopify|Woo|Nuvem|VTEX/),
        tem_form_captura: /type=["']email["']|newsletter|cadastre-se|assine|inscreva/i.test(homeHtml),
        tem_blog: /\/blog|artigos|noticias/i.test(homeHtml),
        plataforma,
        paginas_lidas: [base],
        resumo_texto: limparHtml(homeHtml).slice(0, 3500),
    };

    // Le ate 2 paginas internas relevantes (sobre / servicos / produtos)
    try {
        const hrefs = Array.from(homeHtml.matchAll(/href=["']([^"']+)["']/gi)).map((m) => m[1]);
        const alvos = hrefs
            .filter((h) => /(sobre|quem-somos|servi|produto|soluco|contato)/i.test(h))
            .slice(0, 2)
            .map((h) => {
                try { return new URL(h, base).href; } catch { return ""; }
            })
            .filter((h) => h && h.startsWith("http"));
        for (const alvo of Array.from(new Set(alvos))) {
            try {
                const r = await fetchComTimeout(alvo, { headers: { "User-Agent": "Mozilla/5.0 (compatible; NGProspect/1.0)" } }, 10000);
                if (r.ok) {
                    const t = limparHtml(await r.text()).slice(0, 1500);
                    if (t.length > 150) {
                        sinais.resumo_texto += "\n\n[" + alvo + "]\n" + t;
                        sinais.paginas_lidas.push(alvo);
                    }
                }
            } catch { /* ignora pagina interna que falhar */ }
        }
    } catch { /* sem links internos */ }

    sinais.resumo_texto = sinais.resumo_texto.slice(0, 6000);
    return sinais;
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

function anosDeMercado(dataInicio?: string): number | null {
    if (!dataInicio) return null;
    const d = new Date(dataInicio);
    if (isNaN(d.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 365)));
}

const SYSTEM_PROMPT = [
    "Voce e consultor comercial senior do Grupo NG, assessoria de marketing e vendas do Yuri Garcia. Voce olhou os dados publicos desta empresa (Receita Federal e o site dela) como quem prepara uma reuniao de diagnostico. Pense como dono de negocio, nao como redator.",
    "",
    "Seu trabalho e CRUZAR os dados e tirar conclusoes que o dono nao veria sozinho. Exemplos de raciocinio (adapte ao caso, nao copie):",
    "- Empresa com muitos anos de mercado + site sem pixel de rastreamento = anos de trafego jogados fora, impossivel remarketing.",
    "- CNAE de atacado + site sem area de catalogo/login de lojista = dependencia de indicacao, sem canal de aquisicao de novos lojistas.",
    "- Tem loja online mas sem WhatsApp visivel = atrito na duvida antes da compra, carrinho abandonado que nao volta.",
    "- Instagram ativo como unico canal = todo o negocio refem do alcance organico de UMA plataforma.",
    "",
    "Produza um JSON com EXATAMENTE estas chaves:",
    '- "observacoes": array com 3 observacoes. Cada uma: um FATO concreto da ficha + a CONSEQUENCIA comercial dele (o que isso custa em cliente/faturamento). Especifica, nao obvia. Proibido elogio vazio e proibido observacao sobre ausencia de dado de pesquisa.',
    '- "dor": em 1 frase, a dor central que amarra as 3 observacoes (foco em dinheiro perdido ou risco).',
    '- "gancho": a observacao mais forte pra abrir conversa, reescrita como algo que doi ou como oportunidade que a concorrencia ja aproveita. Nunca um elogio.',
    "- insight_gratis: 1 acao concreta e especifica pra ESSA empresa que ela poderia aplicar sozinha (entregamos de graca pra gerar reciprocidade). Nada de conselho generico tipo faca um site.",
    "- mensagem_1: a primeira mensagem de WhatsApp. Estrutura: saudacao com o primeiro nome do socio (se houver; senao Oi tudo bem) + aqui e o Yuri do Grupo NG + o gancho dito de forma leve e humana + 1 frase curta do que a NG faz + loop aberto (notei mais 2 pontos alem desse) + pergunta final curta. Pontuacao natural de conversa. Sem link. Sem travessao. Sem emoji. Maximo 500 caracteres. Tom de gente de verdade mandando mensagem, nunca anuncio nem robo.",
    "",
    "REGRAS ABSOLUTAS: proibido inventar numero ou fato que nao esteja na ficha. Nunca cite metrica que voce nao tem (ex: numero de seguidores). Nunca transforme a falta de um dado em observacao. Se a pesquisa do site falhou, trabalhe com a Receita e o nicho. Responda SOMENTE o JSON.",
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
                temperature: 0.65,
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: "FICHA DA EMPRESA (dados reais coletados):\n" + JSON.stringify(ficha, null, 2) },
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

/** Monta a ficha consolidada (Receita + site) que alimenta o dossie. Exportada pro diagnostico reusar. */
export function montarFicha(lead: LeadParaEnriquecer, receita: Record<string, any> | null, site: SinaisSite): Record<string, unknown> {
    const anos = anosDeMercado(receita?.data_inicio_atividade);
    return {
        empresa: lead.empresa || receita?.nome_fantasia || receita?.razao_social || "",
        nicho: lead.nicho || receita?.cnae_fiscal_descricao || "",
        cidade: lead.cidade || receita?.municipio || "",
        instagram: lead.instagram || "",
        receita: receita
            ? {
                  razao_social: receita.razao_social,
                  nome_fantasia: receita.nome_fantasia,
                  porte: receita.porte,
                  anos_de_mercado: anos,
                  abertura: receita.data_inicio_atividade,
                  capital_social: receita.capital_social,
                  simples_nacional: receita.opcao_pelo_simples,
                  atividade_principal: receita.cnae_fiscal_descricao,
                  atividades_secundarias: ((receita.cnaes_secundarios as any[]) || []).map((c) => c.descricao),
                  socio_admin: extrairSocio(receita) || null,
              }
            : "CNPJ nao consultado",
        site: site.online
            ? {
                  online: true,
                  titulo: site.titulo,
                  descricao_meta: site.descricao,
                  plataforma: site.plataforma || "nao identificada",
                  tem_pixel_meta: site.tem_pixel_meta,
                  tem_google_analytics: site.tem_ga_ou_gtm,
                  tem_whatsapp_no_site: site.tem_whatsapp,
                  tem_loja_online: site.tem_loja_online,
                  tem_captura_de_lead: site.tem_form_captura,
                  tem_blog: site.tem_blog,
                  paginas_lidas: site.paginas_lidas,
                  trecho_do_site: site.resumo_texto,
              }
            : "sem site informado ou site fora do ar",
    };
}

/**
 * Orquestra o enriquecimento completo: consulta CNPJ, analisa o site, monta a
 * ficha rica e gera o dossie. Lanca erro se a geracao falhar.
 */
export async function enriquecerLead(lead: LeadParaEnriquecer): Promise<ResultadoEnriquecimento> {
    const [receita, site] = await Promise.all([
        lead.cnpj ? consultarCnpj(lead.cnpj) : Promise.resolve(null),
        lead.site ? analisarSite(lead.site) : Promise.resolve(await analisarSite("")),
    ]);

    const socio = extrairSocio(receita);
    const ficha = montarFicha(lead, receita, site);
    const dossie = await gerarDossie(ficha);

    return {
        socio,
        dossie,
        raw: { receita: receita || null, site, ficha, modelo: OPENAI_MODEL },
    };
}
