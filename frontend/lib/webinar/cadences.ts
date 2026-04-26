/**
 * Cadencias adaptativas de webinar com OPT-IN + NUTRICAO.
 *
 * Filosofia:
 *   1. Convite inicial NUNCA tem link Meet. So pergunta se quer participar.
 *      Status do lead muda pra `pending_optin`.
 *   2. Apenas leads `opted_in` (que aceitaram via agente Gemini) recebem nutricao + lembretes.
 *   3. Nutricao = conteudo de valor preparando o lead pra absorver melhor o webinar.
 *   4. Lembretes = D-1, 1h antes, 10min antes (so com Meet link).
 *
 * Steps tem 2 modos de agendamento:
 *   - byOffset: dia_offset + hora absoluta (ex: D-7 as 10h)
 *   - byEvent: minutos antes do evento (ex: 60 min antes)
 *
 * Cada step pode declarar:
 *   - requireStatus: so dispara se lead estiver nesse status (ex: opted_in)
 *   - setStatusAfterSend: muda status do lead apos envio (ex: pending_optin apos convite)
 */

import type { WebinarFunnelStatus } from "@/types/webinar";

export type CadenceStep = {
  /** label visivel no funil */
  label: string;
  /** template da mensagem com variaveis: {empresa} {tema} {data} {hora} {meet_link} {cal_link} */
  template: string;
  /** quando disparar */
  schedule:
    | { type: "byOffset"; dayOffset: number; hour: number; minute?: number }
    | { type: "byEvent"; minutesBefore: number };
  /** se definido, so dispara se lead estiver neste status */
  requireStatus?: WebinarFunnelStatus;
  /** se definido, muda lead pra este status apos envio bem-sucedido */
  setStatusAfterSend?: WebinarFunnelStatus;
  /** label da etapa (convite | nutricao | lembrete) pra agrupar visualmente */
  category: "convite" | "nutricao" | "lembrete" | "fallback";
};

export type CadenceProfile = "LONGA" | "MEDIA" | "CURTA" | "URGENTE" | "FINAL";

export const CADENCES: Record<CadenceProfile, CadenceStep[]> = {
  // 7+ dias ate o evento — convite + 2 nutricoes + 3 lembretes
  LONGA: [
    {
      category: "convite",
      label: "Convite (opt-in)",
      template:
        "Oi {empresa}, tudo bem? Vou rodar um webinar pratico essa semana: \"{tema}\".\n\nVai ser direto, conteudo aplicavel sem encheção. Tem interesse em participar?\n\nSe topar, te mando os detalhes e o link.",
      schedule: { type: "byOffset", dayOffset: -7, hour: 10 },
      setStatusAfterSend: "pending_optin",
    },
    {
      category: "fallback",
      label: "Reforco D-5 (sem resposta)",
      template:
        "{empresa}, voltando aqui. Reforço o convite pro webinar \"{tema}\" dia {data} as {hora}. Vale a pena pra quem quer estruturar marketing pra performance. Topa?",
      schedule: { type: "byOffset", dayOffset: -5, hour: 14 },
      requireStatus: "pending_optin",
    },
    {
      category: "nutricao",
      label: "Nutricao 1 (D-3)",
      template:
        "{empresa}, pra ja ir aquecendo: a gente vai abrir o jogo sobre os 4 pilares que separam quem so faz marketing de quem realmente vende.\n\nNao e formula magica, e operacao bem feita. Te vejo dia {data}.",
      schedule: { type: "byOffset", dayOffset: -3, hour: 14 },
      requireStatus: "opted_in",
    },
    {
      category: "nutricao",
      label: "Nutricao 2 (D-2)",
      template:
        "{empresa}, mais um teaser: a maioria das empresas perde dinheiro NAO no trafego, mas no que vem antes (oferta, copy, posicionamento) e no que vem depois (atendimento, fechamento).\n\nNo webinar a gente abre os 4 pontos onde vc provavelmente esta sangrando. Dia {data} as {hora}.",
      schedule: { type: "byOffset", dayOffset: -2, hour: 14 },
      requireStatus: "opted_in",
    },
    {
      category: "lembrete",
      label: "Vespera + Link",
      template:
        "{empresa}, o webinar e amanha as {hora}.\n\nLink Meet: {meet_link}\n\nSalva ai pra nao esquecer. Te espero.",
      schedule: { type: "byOffset", dayOffset: -1, hour: 18 },
      requireStatus: "opted_in",
    },
    {
      category: "lembrete",
      label: "1h antes",
      template:
        "{empresa}, em 1 hora comecamos.\n\nLink: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "opted_in",
    },
    {
      category: "lembrete",
      label: "10 min antes",
      template:
        "{empresa}, ta comecando agora.\n\nEntra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "opted_in",
    },
  ],

  // 3-7 dias — convite + 1 nutricao + 3 lembretes
  MEDIA: [
    {
      category: "convite",
      label: "Convite (opt-in)",
      template:
        "Oi {empresa}, tudo bem? Vou rodar um webinar essa semana: \"{tema}\".\n\nDireto ao ponto, conteudo aplicavel. Acontece dia {data} as {hora}. Topa participar?",
      schedule: { type: "byOffset", dayOffset: -3, hour: 10 },
      setStatusAfterSend: "pending_optin",
    },
    {
      category: "nutricao",
      label: "Nutricao (D-2)",
      template:
        "{empresa}, pra ja ir aquecendo: a maioria das empresas perde dinheiro nao no trafego, e sim na oferta + atendimento. No webinar a gente abre os 4 pilares que mudam o jogo. Dia {data} as {hora}.",
      schedule: { type: "byOffset", dayOffset: -2, hour: 14 },
      requireStatus: "opted_in",
    },
    {
      category: "lembrete",
      label: "Vespera + Link",
      template:
        "{empresa}, o webinar \"{tema}\" e amanha as {hora}.\n\nLink: {meet_link}",
      schedule: { type: "byOffset", dayOffset: -1, hour: 18 },
      requireStatus: "opted_in",
    },
    {
      category: "lembrete",
      label: "1h antes",
      template:
        "{empresa}, em 1 hora comecamos. Link: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "opted_in",
    },
    {
      category: "lembrete",
      label: "10 min antes",
      template:
        "{empresa}, ta comecando agora. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "opted_in",
    },
  ],

  // 1-3 dias — convite + 2 lembretes (sem nutricao, sem tempo)
  CURTA: [
    {
      category: "convite",
      label: "Convite urgente (opt-in)",
      template:
        "Oi {empresa}, vou rodar um webinar amanha as {hora}: \"{tema}\". 30 min, conteudo aplicavel. Topa participar?",
      schedule: { type: "byOffset", dayOffset: -1, hour: 10 },
      setStatusAfterSend: "pending_optin",
    },
    {
      category: "lembrete",
      label: "1h antes",
      template:
        "{empresa}, em 1 hora comecamos o webinar. Link: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 60 },
      requireStatus: "opted_in",
    },
    {
      category: "lembrete",
      label: "10 min antes",
      template:
        "{empresa}, ta comecando agora. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "opted_in",
    },
  ],

  // 12-24h — convite com link inline + last call
  URGENTE: [
    {
      category: "convite",
      label: "Convite hoje",
      template:
        "Oi {empresa}, vou rodar um webinar hoje as {hora}: \"{tema}\". Direto, 30 min. Topa entrar? Se sim te mando o link na hora.",
      schedule: { type: "byOffset", dayOffset: 0, hour: 9 },
      setStatusAfterSend: "pending_optin",
    },
    {
      category: "lembrete",
      label: "10 min antes",
      template:
        "{empresa}, ta comecando agora. Entra: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 10 },
      requireStatus: "opted_in",
    },
  ],

  // < 12h — last call ultra direto
  FINAL: [
    {
      category: "convite",
      label: "Last call",
      template:
        "Oi {empresa}, ta comecando agora um webinar rapido sobre \"{tema}\". Se topar entrar, link: {meet_link}",
      schedule: { type: "byEvent", minutesBefore: 15 },
      setStatusAfterSend: "pending_optin",
    },
  ],
};

export function pickCadence(
  eventDate: Date,
  now: Date = new Date(),
): CadenceProfile {
  const diffMs = eventDate.getTime() - now.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);

  if (days >= 7) return "LONGA";
  if (days >= 3) return "MEDIA";
  if (days >= 1) return "CURTA";
  if (days >= 0.5) return "URGENTE";
  return "FINAL";
}

export function scheduleSteps(
  steps: CadenceStep[],
  eventDate: Date,
  now: Date = new Date(),
): Array<{ step: CadenceStep; scheduledAt: Date }> {
  const result: Array<{ step: CadenceStep; scheduledAt: Date }> = [];

  for (const step of steps) {
    let scheduledAt: Date;

    if (step.schedule.type === "byOffset") {
      scheduledAt = new Date(eventDate);
      scheduledAt.setDate(scheduledAt.getDate() + step.schedule.dayOffset);
      scheduledAt.setHours(step.schedule.hour, step.schedule.minute ?? 0, 0, 0);
    } else {
      scheduledAt = new Date(eventDate.getTime() - step.schedule.minutesBefore * 60_000);
    }

    if (scheduledAt < now) continue;

    result.push({ step, scheduledAt });
  }

  return result;
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, v);
  }
  return out;
}
