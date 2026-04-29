/**
 * Cadências do webinar — Fase 1 conversacional + Fase 2 lembretes/nutrição.
 *
 * FILOSOFIA:
 *
 * Fase 1 (cold outreach):
 *   1. Cron dispara UMA mensagem inicial: "Bom dia, tudo bem?" (com variações).
 *   2. Lead responde -> webhook -> agente Gemini conduz toda a qualificação.
 *   3. Agente coleta nome + email/tel via tool collect_responsible_info.
 *   4. Status vira 'confirmed' -> automaticamente agenda Fase 2.
 *
 * Fase 2 (reminders + nutrição, após confirmação):
 *   - 5 perfis baseados em quanto falta pro evento na hora da confirmação:
 *     RICA (7+ dias)    -> 3 nutrições + 3 lembretes + pós-evento
 *     MEDIA (3-7 dias)  -> 1 nutrição + 3 lembretes + pós-evento
 *     CURTA (1-3 dias)  -> véspera + 1h + 10min + pós-evento
 *     EXPRESS (12-24h)  -> 30min depois + 10min antes + pós-evento
 *     FINAL (<12h)      -> link Meet imediato + pós-evento
 *
 * Tom das nutrições: Ícaro (provocador, direto, sem firula, sem clichê de IA).
 *
 * Anti-ban:
 *   - Variações automáticas da saudação inicial baseadas em turno do dia.
 *   - Cron de initial_outreach espalha disparos com jitter de 3-7 min.
 *   - pickInstance roda round-robin balanceado entre instances ativas.
 */

import type { WebinarFunnelStatus } from "@/types/webinar";

// ─── Variações da saudação inicial (anti-ban) ────────────────────────────────

export const INITIAL_GREETINGS = {
  manha: [
    "Bom dia, tudo bem?",
    "Bom dia! Tudo bem?",
    "Bom dia, tudo bem por aí?",
    "Olá, bom dia! Tudo bem?",
    "Oi, bom dia, tudo bem?",
    "Bom dia, tudo certo?",
  ],
  tarde: [
    "Boa tarde, tudo bem?",
    "Boa tarde! Tudo bem?",
    "Olá, boa tarde, tudo bem?",
    "Oi, boa tarde, tudo bem?",
    "Boa tarde, tudo certo?",
    "Boa tarde, tudo bem por aí?",
  ],
  noite: [
    "Boa noite, tudo bem?",
    "Boa noite! Tudo bem?",
    "Olá, boa noite, tudo bem?",
    "Oi, boa noite, tudo bem?",
  ],
};

export function detectPeriod(now: Date = new Date()): "manha" | "tarde" | "noite" {
  // Sempre usa horário do Brasil (America/Sao_Paulo) independente do servidor
  const h = parseInt(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(now),
    10,
  );
  if (h >= 5 && h < 12) return "manha";
  if (h >= 12 && h < 18) return "tarde";
  return "noite"; // 18h-04h
}

export function pickInitialGreeting(now: Date = new Date()): string {
  const period = detectPeriod(now);
  const variations = INITIAL_GREETINGS[period];
  return variations[Math.floor(Math.random() * variations.length)];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "Olá";
  const first = fullName.trim().split(/\s+/)[0];
  // Sanitização: nomes esquisitos que a IA pode ter passado por engano
  const blacklist = new Set([
    "responsável", "responsavel", "lead", "cliente", "tudo", "sim", "não", "nao",
    "ok", "obrigado", "obrigada", "confirmado", "empresa", "petshop", "clínica", "clinica",
  ]);
  if (blacklist.has(first.toLowerCase())) return "Olá";
  // Capitaliza
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v ?? "");
  }
  return out;
}

// ─── Reminder cadence (Fase 2, pós-confirmação) ──────────────────────────────

export type ReminderStep = {
  /** label visível no funil */
  label: string;
  /** categoria pro cron diferenciar timing */
  category: "nutricao" | "reminder" | "post_event";
  /** template com variáveis: {primeiro_nome} {empresa} {tema} {data} {hora} {meet_link} {cal_link} */
  template: string;
  /** quando disparar */
  schedule:
    | { type: "byOffset"; dayOffset: number; hour: number; minute?: number }
    | { type: "byEvent"; minutesBefore: number }
    | { type: "afterConfirm"; minutes: number };
  /** se definido, só dispara se lead estiver neste status */
  requireStatus?: WebinarFunnelStatus;
  /** ramificação pós-evento: 'attended' ou 'no_show' (apenas pra steps post_event) */
  branch?: "attended" | "no_show";
};

export type ReminderProfile = "RICA" | "MEDIA" | "CURTA" | "EXPRESS" | "FINAL";

/**
 * 5 perfis adaptativos baseados em quanto falta pro evento NA HORA da confirmação.
 *
 * Templates no tom Ícaro de Carvalho: provocador, direto, primeira pessoa,
 * sem clichê de IA, sem listas, sem firula.
 */
export const REMINDER_PROFILES: Record<ReminderProfile, ReminderStep[]> = {
  // 7+ dias: nutrição rica + lembretes + pós-evento
  RICA: [
    {
      category: "nutricao",
      label: "Nutrição 1 (D-5) - tese central",
      template:
        "{primeiro_nome}, pensando aqui pro nosso encontro de {data}.\n\nA maioria das clínicas e petshops queima dinheiro em ad querendo crescer, enquanto perde 30-40% da margem dentro de casa. Atendimento, recompra, balcão, precificação.\n\nÉ disso que vou falar. 5 pilares concretos, não papo de marketeiro.",
      schedule: { type: "byOffset", dayOffset: -5, hour: 14 },
      requireStatus: "confirmed",
    },
    {
      category: "nutricao",
      label: "Nutrição 2 (D-3) - exemplo concreto",
      template:
        "Pequeno exemplo, {primeiro_nome}: já acompanhei petshop que dobrou ticket médio sem novo cliente. Só ajustou o combo de banho mensal e o jeito como o atendente sugeria ração no balcão.\n\nZero ad. Margem destravada. É o tipo de coisa que abro dia {data}.",
      schedule: { type: "byOffset", dayOffset: -3, hour: 14 },
      requireStatus: "confirmed",
    },
    {
      category: "nutricao",
      label: "Nutrição 3 (D-2) - prova social leve",
      template:
        "Já passei esse conteúdo pra +96 equipes de clínica e petshop, {primeiro_nome}.\n\nOs que aplicaram tiveram resultado mensurável. Os que não, ficaram onde estavam. Vai ser ao vivo dia {data} às {hora}.",
      schedule: { type: "byOffset", dayOffset: -2, hour: 14 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "Véspera D-1 + Link",
      template:
        "{primeiro_nome}, é amanhã às {hora}.\n\nLink do Meet: {meet_link}",
      schedule: { type: "byOffset", dayOffset: -1, hour: 18 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "1h antes",
      template:
        "Daqui 1h a gente começa, {primeiro_nome}. Link: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "10 min antes",
      template:
        "Tá começando, {primeiro_nome}. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "confirmed",
    },
  ],

  // 3-7 dias: 1 nutrição + lembretes
  MEDIA: [
    {
      category: "nutricao",
      label: "Nutrição (D-2) - tese central",
      template:
        "{primeiro_nome}, pensando aqui pro evento de {data}.\n\nA maioria de clínica e petshop queima dinheiro em ad pra crescer e perde 30-40% da margem dentro de casa. Atendimento, recompra, balcão.\n\nVou abrir os 5 pilares que mudam isso. Sem papo teórico.",
      schedule: { type: "byOffset", dayOffset: -2, hour: 14 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "Véspera D-1 + Link",
      template:
        "{primeiro_nome}, é amanhã às {hora}. Link: {meet_link}",
      schedule: { type: "byOffset", dayOffset: -1, hour: 18 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "1h antes",
      template:
        "Daqui 1h a gente começa, {primeiro_nome}. Link: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "10 min antes",
      template: "Tá começando, {primeiro_nome}. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "confirmed",
    },
  ],

  // 1-3 dias: comprimido
  CURTA: [
    {
      category: "reminder",
      label: "Véspera D-1 + Link",
      template:
        "{primeiro_nome}, é amanhã às {hora}. Link: {meet_link}",
      schedule: { type: "byOffset", dayOffset: -1, hour: 18 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "1h antes",
      template:
        "Daqui 1h a gente começa, {primeiro_nome}. Link: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "10 min antes",
      template: "Tá começando, {primeiro_nome}. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "confirmed",
    },
  ],

  // 12-24h: muito comprimido
  EXPRESS: [
    {
      category: "reminder",
      label: "30 min após confirmar (salva o link)",
      template:
        "Já anotei aqui, {primeiro_nome}. Salva o link pra não perder: {meet_link}\n\n{data} às {hora}.",
      schedule: { type: "afterConfirm", minutes: 30 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "10 min antes",
      template: "Tá começando, {primeiro_nome}. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "confirmed",
    },
  ],

  // <12h: minimalista
  FINAL: [
    {
      category: "reminder",
      label: "Imediato após confirmar",
      template:
        "{primeiro_nome}, é hoje às {hora}.\n\nLink: {meet_link}",
      schedule: { type: "afterConfirm", minutes: 5 },
      requireStatus: "confirmed",
    },
  ],
};

export function pickReminderProfile(
  eventDate: Date,
  confirmedAt: Date = new Date(),
): ReminderProfile {
  const diffMs = eventDate.getTime() - confirmedAt.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);

  if (days >= 7) return "RICA";
  if (days >= 3) return "MEDIA";
  if (days >= 1) return "CURTA";
  if (days >= 0.5) return "EXPRESS";
  return "FINAL";
}

/**
 * Calcula scheduled_at absoluto pra cada step do perfil.
 * Steps no passado são filtrados.
 */
export function scheduleReminderSteps(
  steps: ReminderStep[],
  eventDate: Date,
  confirmedAt: Date = new Date(),
  now: Date = new Date(),
): Array<{ step: ReminderStep; scheduledAt: Date }> {
  const result: Array<{ step: ReminderStep; scheduledAt: Date }> = [];

  for (const step of steps) {
    let scheduledAt: Date;

    if (step.schedule.type === "byOffset") {
      scheduledAt = new Date(eventDate);
      scheduledAt.setDate(scheduledAt.getDate() + step.schedule.dayOffset);
      scheduledAt.setHours(
        step.schedule.hour,
        step.schedule.minute ?? 0,
        0,
        0,
      );
    } else if (step.schedule.type === "byEvent") {
      scheduledAt = new Date(
        eventDate.getTime() - step.schedule.minutesBefore * 60_000,
      );
    } else {
      scheduledAt = new Date(
        confirmedAt.getTime() + step.schedule.minutes * 60_000,
      );
    }

    if (scheduledAt < now) continue;
    result.push({ step, scheduledAt });
  }

  return result;
}
