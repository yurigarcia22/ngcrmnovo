// Regras dos numeros da Inteligencia. Usadas pela tela de cada clinica e pela
// visao "Clientes" da equipe NG: os dois lugares precisam contar igual.

export const STAGE_META: Record<string, { label: string; cls: string; group: string }> = {
    NEW_LEAD:          { label: "Novo lead",          cls: "bg-indigo-50 text-indigo-700 border-indigo-200",   group: "aberto" },
    QUALIFYING:        { label: "Qualificando",       cls: "bg-blue-50 text-blue-700 border-blue-200",         group: "aberto" },
    QUALIFIED:         { label: "Qualificado",        cls: "bg-sky-50 text-sky-700 border-sky-200",            group: "aberto" },
    SCHEDULING:        { label: "Agendando",          cls: "bg-amber-50 text-amber-700 border-amber-200",      group: "aberto" },
    SCHEDULED:         { label: "Agendado",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200", group: "ganho" },
    AWAITING_CUSTOMER: { label: "Aguardando cliente", cls: "bg-slate-100 text-slate-600 border-slate-200",     group: "espera" },
    AWAITING_BUSINESS: { label: "Aguardando clínica", cls: "bg-rose-50 text-rose-700 border-rose-200",         group: "espera" },
    NO_RESPONSE:       { label: "Sem resposta",       cls: "bg-slate-100 text-slate-500 border-slate-200",     group: "espera" },
    LOST_PRICE:        { label: "Perda sugerida · preço",           cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_AVAILABILITY: { label: "Perda sugerida · disponibilidade", cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_NO_RESPONSE:  { label: "Perda sugerida · sem resposta",    cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_NOT_OFFERED:  { label: "Perda sugerida · sem oferta",      cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_SERVICE_UNAVAILABLE: { label: "Perda sugerida · serviço indisponível", cls: "bg-rose-50 text-rose-700 border-rose-200", group: "perda" },
    LOST_OTHER:        { label: "Perda sugerida",     cls: "bg-rose-50 text-rose-700 border-rose-200",         group: "perda" },
    EXISTING_PATIENT:  { label: "Paciente existente", cls: "bg-teal-50 text-teal-700 border-teal-200",         group: "outro" },
    NON_COMMERCIAL:    { label: "Não comercial",      cls: "bg-slate-100 text-slate-500 border-slate-200",     group: "outro" },
    COMPLETED:         { label: "Concluído",          cls: "bg-emerald-50 text-emerald-700 border-emerald-200", group: "ganho" },
};
export const stageMeta = (s?: string | null) => STAGE_META[s ?? ""] ?? { label: s ?? "—", cls: "bg-slate-100 text-slate-500 border-slate-200", group: "outro" };

export type Periodo = "hoje" | "7d" | "30d" | "all" | "custom";

export function limitesDoPeriodo(period: Periodo, customFrom = "", customTo = "") {
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (period === "hoje") { from = new Date(now); from.setHours(0, 0, 0, 0); }
    else if (period === "7d") from = new Date(now.getTime() - 7 * 86400_000);
    else if (period === "30d") from = new Date(now.getTime() - 30 * 86400_000);
    else if (period === "custom") {
        if (customFrom) from = new Date(customFrom + "T00:00:00");
        if (customTo) to = new Date(customTo + "T23:59:59");
    }
    return { from, to };
}

export function calcularVisao(states: any[], period: Periodo, customFrom = "", customTo = "") {
    const { from, to } = limitesDoPeriodo(period, customFrom, customTo);
    const tsIn = (ts: string | null | undefined) => {
        if (!ts) return false;
        const d = new Date(ts);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
    };
    // Periodo = data da ultima MENSAGEM da conversa (last_analyzed_message_at),
    // nao da analise: a re-analise em massa re-toca updated_at e mentiria.
    const periodStates = states.filter((row) => tsIn(row.last_analyzed_message_at ?? row.updated_at));
    const open = periodStates.filter((s) => s.deal?.status === "open");

    // Leads novos = 1o contato DENTRO do periodo, independente da ultima mensagem:
    // o lead fica para sempre no dia em que chegou (bate com o Gerenciador da Meta)
    // e o numero de um periodo fechado nao encolhe quando a conversa continua.
    // Paciente existente e conversa nao comercial nao contam como lead.
    // "Tudo": corte em setembro/2026 (inicio da contabilidade).
    const corte = from ?? new Date("2026-09-01T00:00:00");
    const newLeads = states.filter((r) => {
        if (!r.first_contact_at) return false;
        if (r.contact_classification === "EXISTING_PATIENT" || r.contact_classification === "NON_COMMERCIAL") return false;
        const d = new Date(r.first_contact_at);
        return d >= corte && (!to || d <= to);
    });

    const esperando = open.filter((s) => s.waiting_on === "BUSINESS");
    const esperaMaisAntiga = esperando
        .map((s) => s.waiting_since as string | null)
        .filter(Boolean)
        .sort()[0] ?? null;

    const overview = {
        analisadas: periodStates.length,
        leadsNovos: newLeads.length,
        altaIntencao: open.filter((s) => (s.intent_score ?? 0) >= 70 && stageMeta(s.funnel_stage).group === "aberto").length,
        aguardandoClinica: esperando.length,
        esperaMaisAntiga,
        // Conta pela DATA REAL da confirmacao (nao pela ultima msg da conversa):
        // agendamento de ontem nao pode "migrar" pra hoje quando a conversa continua.
        agendamentos: states.filter((s) => tsIn(s.appointment_confirmed_at)).length,
        perdasSugeridas: open.filter((s) => !!s.lost_suggestion).length,
    };
    return { periodStates, open, newLeads, overview };
}
