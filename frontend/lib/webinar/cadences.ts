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
  if (!fullName) return "tudo bem";
  return fullName.trim().split(/\s+/)[0];
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
      label: "Nutrição 1 (D-5) - provoca reflexão",
      template:
        "Oi {primeiro_nome}, vou ser direto contigo já que o evento tá chegando.\n\nA maioria das clínicas perde dinheiro NÃO no tráfego, e sim no que vem antes (oferta) e depois (atendimento). Anúncio é só ferramenta. Quem opera o resto bem ganha.\n\nDia {data} eu abro os 4 pilares disso na prática.",
      schedule: { type: "byOffset", dayOffset: -5, hour: 14 },
      requireStatus: "confirmed",
    },
    {
      category: "nutricao",
      label: "Nutrição 2 (D-3) - case/dado real",
      template:
        "{primeiro_nome}, mais uma pra ir aquecendo:\n\nJá vi {empresa}-tipo-coisa faturar 2x sem mexer em ad. Só ajustando como recebia o paciente novo (1 ligação, 1 mensagem, 1 retorno). Custou zero. Mudou tudo.\n\nNão é mágica. É operação. Te vejo dia {data} às {hora}.",
      schedule: { type: "byOffset", dayOffset: -3, hour: 14 },
      requireStatus: "confirmed",
    },
    {
      category: "nutricao",
      label: "Nutrição 3 (D-2) - urgência leve",
      template:
        "{primeiro_nome}, falando reto: vai ser ao vivo, sem gravação prévia. Quem entrar pega sem filtro o que travamos cliente em outra clínica que ajustou e dobrou.\n\nDia {data} às {hora}, 30-40 min. Bloqueia agenda.",
      schedule: { type: "byOffset", dayOffset: -2, hour: 14 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "Véspera D-1 + Link",
      template:
        "Oi {primeiro_nome}, lembrete: o webinar é amanhã às {hora}.\n\nLink: {meet_link}\n\nTe espero lá.",
      schedule: { type: "byOffset", dayOffset: -1, hour: 18 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "1h antes",
      template:
        "Oi {primeiro_nome}, em 1 hora começamos.\n\nLink: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "10 min antes",
      template:
        "{primeiro_nome}, tá começando. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "confirmed",
    },
    {
      category: "post_event",
      label: "D+1 Presente",
      branch: "attended",
      template:
        "Oi {primeiro_nome}, que bom te ver no webinar ontem.\n\nQuer trocar uma ideia 30 min sobre como aplicar isso na {empresa}? Marca aqui:\n{cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "attended",
    },
    {
      category: "post_event",
      label: "D+1 Ausente",
      branch: "no_show",
      template:
        "Oi {primeiro_nome}, senti tua falta no webinar ontem.\n\nVou te mandar a gravação aqui mais tarde. E se quiser conversar sobre o cenário da {empresa}, marca uma call:\n{cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "no_show",
    },
  ],

  // 3-7 dias: 1 nutrição + lembretes + pós-evento
  MEDIA: [
    {
      category: "nutricao",
      label: "Nutrição (D-2)",
      template:
        "Oi {primeiro_nome}, pra já aquecer o evento de {data}:\n\nA maioria das clínicas perde cliente NÃO no tráfego pago, e sim na agenda. Liga, ninguém atende. Atende mal. Custa caro.\n\nA gente vai abrir os 4 pilares que mudam isso.",
      schedule: { type: "byOffset", dayOffset: -2, hour: 14 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "Véspera D-1 + Link",
      template:
        "Oi {primeiro_nome}, lembrete: o webinar é amanhã às {hora}.\n\nLink: {meet_link}",
      schedule: { type: "byOffset", dayOffset: -1, hour: 18 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "1h antes",
      template:
        "{primeiro_nome}, em 1 hora começamos. Link: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "10 min antes",
      template: "{primeiro_nome}, tá começando. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "confirmed",
    },
    {
      category: "post_event",
      label: "D+1 Presente",
      branch: "attended",
      template:
        "Oi {primeiro_nome}, que bom te ver no webinar ontem.\n\nQuer trocar uma ideia 30 min sobre como aplicar isso na {empresa}? Marca aqui:\n{cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "attended",
    },
    {
      category: "post_event",
      label: "D+1 Ausente",
      branch: "no_show",
      template:
        "Oi {primeiro_nome}, senti tua falta ontem.\n\nVou te mandar a gravação. E se quiser falar sobre o cenário da {empresa}: {cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "no_show",
    },
  ],

  // 1-3 dias: comprimido
  CURTA: [
    {
      category: "reminder",
      label: "Véspera D-1 + Link",
      template:
        "Oi {primeiro_nome}, lembrete: webinar amanhã às {hora}.\n\nLink: {meet_link}\n\nTe espero.",
      schedule: { type: "byOffset", dayOffset: -1, hour: 18 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "1h antes",
      template:
        "{primeiro_nome}, em 1 hora começamos. Link: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "10 min antes",
      template: "{primeiro_nome}, tá começando. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "confirmed",
    },
    {
      category: "post_event",
      label: "D+1 Presente",
      branch: "attended",
      template:
        "Oi {primeiro_nome}, que bom te ver ontem. Quer falar sobre {empresa} 30 min? {cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "attended",
    },
    {
      category: "post_event",
      label: "D+1 Ausente",
      branch: "no_show",
      template:
        "Oi {primeiro_nome}, senti tua falta. Te mando a gravação. Se quiser conversar sobre {empresa}: {cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "no_show",
    },
  ],

  // 12-24h: muito comprimido
  EXPRESS: [
    {
      category: "reminder",
      label: "30 min após confirmar (lembrete imediato)",
      template:
        "{primeiro_nome}, anotei aqui. Te lembro daqui umas horas, mas se quiser já salvar:\n\n{tema}\n{data} às {hora}\nLink: {meet_link}",
      schedule: { type: "afterConfirm", minutes: 30 },
      requireStatus: "confirmed",
    },
    {
      category: "reminder",
      label: "10 min antes",
      template: "{primeiro_nome}, tá começando. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "confirmed",
    },
    {
      category: "post_event",
      label: "D+1 Presente",
      branch: "attended",
      template:
        "Oi {primeiro_nome}, que bom te ver. Quer falar sobre {empresa} 30 min? {cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "attended",
    },
    {
      category: "post_event",
      label: "D+1 Ausente",
      branch: "no_show",
      template:
        "Oi {primeiro_nome}, senti tua falta. Te mando a gravação. {cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "no_show",
    },
  ],

  // <12h: minimalista
  FINAL: [
    {
      category: "reminder",
      label: "Imediato após confirmar",
      template:
        "{primeiro_nome}, vai ser hoje às {hora}.\n\nLink: {meet_link}\n\nTe espero.",
      schedule: { type: "afterConfirm", minutes: 5 },
      requireStatus: "confirmed",
    },
    {
      category: "post_event",
      label: "D+1 Presente",
      branch: "attended",
      template:
        "Oi {primeiro_nome}, que bom te ver. Quer conversar sobre {empresa}? {cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "attended",
    },
    {
      category: "post_event",
      label: "D+1 Ausente",
      branch: "no_show",
      template:
        "Oi {primeiro_nome}, senti tua falta. Te mando a gravação. {cal_link}",
      schedule: { type: "byOffset", dayOffset: 1, hour: 9 },
      requireStatus: "no_show",
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
