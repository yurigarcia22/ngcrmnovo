/**
 * Agente SDR da Prospeccao (Fase B): quando o lead responde no WhatsApp, o agente
 * continua a conversa usando o dossie, qualifica de leve e puxa pra uma conversa
 * com o Yuri. Linguagem de dono, sem jargao, humano.
 */

const OPENAI_MODEL = process.env.PROSPECT_OPENAI_MODEL || "gpt-4o";

export interface LeadSDR {
    empresa: string;
    socio: string | null;
    nicho: string | null;
    cidade: string | null;
    dossie: { observacoes?: string[]; dor?: string; gancho?: string; insight_gratis?: string } | null;
}

export interface TurnoConversa {
    origem: "lead" | "sdr";
    mensagem: string;
}

function system(lead: LeadSDR): string {
    const d = lead.dossie || {};
    return [
        "Voce e o assistente comercial do Yuri Garcia, do Grupo NG (assessoria de marketing e vendas). Voce conversa por WhatsApp com um dono de empresa que respondeu a uma primeira mensagem de prospeccao.",
        "",
        "SEU UNICO OBJETIVO: manter a conversa leve e humana e, quando fizer sentido, puxar pra uma conversa rapida de 20 minutos com o Yuri (pode ser call ou o proprio Yuri assumir o WhatsApp). Nao tente fechar venda nem explicar tudo.",
        "",
        "DADOS QUE VOCE TEM DESSA EMPRESA (use pra dar substancia, sem repetir tudo de uma vez):",
        "- Empresa: " + (lead.empresa || ""),
        "- Dono/contato: " + (lead.socio || "nao identificado"),
        "- Ramo: " + (lead.nicho || "") + (lead.cidade ? " em " + lead.cidade : ""),
        d.dor ? "- Dor provavel: " + d.dor : "",
        d.insight_gratis ? "- Ideia que a gente pode dar de graca: " + d.insight_gratis : "",
        Array.isArray(d.observacoes) && d.observacoes.length ? "- O que a gente observou: " + d.observacoes.join(" | ") : "",
        "",
        "REGRAS:",
        "1. Fale como gente de verdade no WhatsApp: curto, caloroso, direto. Uma ideia por mensagem. Sem parecer robo nem vendedor chato.",
        "2. ZERO jargao. Nunca use pixel, funil, conversao, lead, CRM, trafego, remarketing, engajamento. Fale de cliente, venda, faturamento, matricula.",
        "3. Nao fale preco, nao prometa resultado especifico, nao detalhe contrato. Se perguntarem preco ou escopo, diga que o Yuri te mostra certinho numa conversa rapida porque depende do cenario dele, e puxe pra marcar.",
        "4. Se o lead demonstrar qualquer interesse, ofereca a conversa com o Yuri de forma leve (ex: 'faz sentido eu chamar o Yuri aqui pra ele te mostrar em 20 min?').",
        "5. Sem travessao. Sem emoji exagerado (no maximo um, e so se combinar).",
        "",
        "Responda em JSON: { \"resposta\": string (a mensagem pro WhatsApp do lead), \"precisa_humano\": boolean (true se o lead ficou irritado, pediu preco/juridico com insistencia, ou voce travou e o Yuri deveria assumir) }.",
    ].filter(Boolean).join("\n");
}

const SUBS: [RegExp, string][] = [
    [/\bpixel( do meta)?\b/gi, "ferramenta de acompanhamento"],
    [/\bfunil de vendas\b/gi, "processo de vendas"],
    [/\bfunil\b/gi, "processo de vendas"],
    [/\bremarketing\b/gi, "lembretes para quem visitou"],
    [/\bengajamento\b/gi, "interesse"],
    [/\btr(a|á)fego\b/gi, "visitas"],
    [/\bleads\b/gi, "interessados"],
    [/\blead\b/gi, "interessado"],
    [/\bCRM\b/g, "sistema de acompanhamento"],
];
function limpar(t: string): string {
    let s = t || "";
    for (const [re, sub] of SUBS) s = s.replace(re, sub);
    return s.replace(/\s{2,}/g, " ").trim();
}

export async function gerarRespostaSDR(
    lead: LeadSDR,
    historico: TurnoConversa[],
    mensagemLead: string
): Promise<{ resposta: string; precisa_humano: boolean }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada.");

    const msgs = [
        { role: "system", content: system(lead) },
        ...historico.slice(-12).map((t) => ({ role: t.origem === "sdr" ? "assistant" : "user", content: t.mensagem })),
        { role: "user", content: mensagemLead },
    ];

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    let r: Response;
    try {
        r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
            body: JSON.stringify({ model: OPENAI_MODEL, temperature: 0.7, response_format: { type: "json_object" }, messages: msgs }),
        });
    } finally {
        clearTimeout(t);
    }
    if (!r.ok) throw new Error(`OpenAI ${r.status}`);
    const content = (await r.json())?.choices?.[0]?.message?.content;
    let p: any = {};
    try { p = JSON.parse(content); } catch { p = { resposta: "", precisa_humano: true }; }
    return {
        resposta: limpar(String(p.resposta || "Opa! Deixa eu te responder certinho, ja volto.")),
        precisa_humano: !!p.precisa_humano,
    };
}
