/**
 * Executa as tool calls retornadas pelo agente Gemini.
 * Roda no servidor, atualiza Supabase + Evolution.
 *
 * Tool especial: collect_responsible_info — quando salva nome + (email OU phone),
 * automaticamente:
 *   1. Move lead pra status `confirmed`.
 *   2. Agenda cadência de lembretes (Fase 2) baseada em quanto falta pro evento.
 */

import { createServiceClient } from "@/utils/supabase/service";
import {
  pickInstance,
  sendTextViaEvolution,
  sendTextHuman,
  humanInterMessageDelay,
} from "./evolution";
import {
  REMINDER_PROFILES,
  pickReminderProfile,
  scheduleReminderSteps,
  renderTemplate,
  getFirstName,
} from "./cadences";
import { normalizeBrazilianPhone } from "./scraper";
import type { AgentToolCall } from "./agent-types";

export type ExecutionResult = {
  ok: boolean;
  executed: Array<{ tool: string; result: "ok" | "error"; detail?: string }>;
};

/**
 * Similaridade Jaccard simples entre 2 textos (0..1).
 * Token-based, case-insensitive. Útil pra detectar mensagens duplicadas
 * semanticamente (não só literais).
 */
function textSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
  const ta = new Set(norm(a));
  const tb = new Set(norm(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const intersection = new Set([...ta].filter((x) => tb.has(x)));
  const union = new Set([...ta, ...tb]);
  return intersection.size / union.size;
}

/**
 * Detecta se mensagem inbound parece auto-reply de WhatsApp Business
 * (bot do estabelecimento, não pessoa real).
 *
 * Sinais clássicos:
 * - Sequência de emojis exclamativos/atenção (⚠️⚠️, 🚨, ❗❗)
 * - Frases "ATENÇÃO", "estamos fora", "horário de atendimento", "número migrou"
 * - Menu numerado com asteriscos: *1* *-* opção / 1️⃣ opção
 * - "digite", "selecione", "escolha uma opção"
 * - "não entendemos sua mensagem"
 * - Frases padrão de cobertura ("agradecemos seu contato, retornaremos...")
 */
export function looksLikeAutoReply(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  // ANTES: tratava text.length <= 2 como auto-reply.
  // BUG: pegava "oi", "ok", "?" como auto-reply e o agente ignorava
  // respostas humanas legítimas. Removido — agente decide o que fazer.

  const patterns = [
    // Sinais clássicos
    /aten[cç][aã]o.{0,20}!{2,}/i,
    /[⚠🚨❗]{2,}/u,
    /(?:estamos fora|fora do hor[aá]rio|hor[aá]rio de atendimento)/i,
    /(?:n[uú]mero (?:mudou|migrou|trocou|atualizado)|novo (?:n[uú]mero|whatsapp))/i,
    /(?:agradecemos|obrigad[oa]) (?:o |pelo |pela )?(?:seu |contato|interesse).{0,40}(?:retornarem|responder|brevidade)/i,
    /respondemos? em breve|retornaremos|fora do expediente/i,
    /assim que poss[ií]vel.{0,30}(?:respond|retornar)/i,
    /(?:olá|oi).*(?:!{2,}|💙|🧡|🩺|🩵|😁)/iu,

    // Menus numerados de WhatsApp Business
    /\*\s*[1-9]\s*\*\s*[-–]\s*\*/i,                          // *1* - * ou *1* *-* *
    /(?:[1-9][⃣]|[1-9]\s*[-–.):])\s+\S+.*\n.*[1-9]/i,    // 1️⃣ x  2️⃣ y / 1 - x  2 - y (>=2 opções)
    /digite\s+(?:o\s+n[uúº°]?|a\s+op[cç][aã]o|um[a]?\s+(?:n[uú]mero|op[cç][aã]o))/i,
    /(?:selecione|escolha)\s+(?:um[a]?\s+)?(?:das?\s+)?(?:op[cç]|alternativa)/i,
    /(?:para|p[ra])\s+(?:falar|atendimento|continuar).{0,40}digit/i,
    /n[aã]o\s+entendemos\s+(?:sua|a)\s+mensag/i,
    /por\s+favor\s+(?:digite|escolha|selecione)/i,
    /(?:autoatendimento|menu\s+(?:principal|de\s+op[cç][oõ]es))/i,
    /(?:bem.?vindo|seja\s+bem.?vindo).{0,80}(?:digite|escolha|selecione|op[cç][aã]o)/i,

    // Redirecionamento de número ("este número é exclusivo, entre em contato no outro")
    /(?:este\s+n[uú]mero|este\s+contato)\s+(?:é|e|esta|está)\s+(?:exclusivo|apenas)/i,
    /(?:entrar?\s+em\s+contato|favor\s+contat[ae]r|contat[ae]r)\s+(?:no\s+(?:n[uú]mero|whatsapp|tel)|pelo\s+(?:n[uú]mero|whatsapp|tel))/i,
    /(?:n[uú]mero\s+(?:correto|certo|adequado))/i,
    /(?:esta\s+(?:linha|n[uú]mero))\s+(?:n[aã]o|nao)\s+(?:atende|recebe|responde)/i,
    // 'agradecemos pelo contato' SO se vier com 'retornaremos' ou similar — auto-reply genuino
    /(?:agradecemos|obrigad[oa])\s+(?:o|pelo|pela)?\s*(?:seu\s+)?contato.{0,80}(?:retornar|responder|breve|brevidade|equipe|aguarde)/i,
  ];
  return patterns.some((re) => re.test(text));
}

/**
 * Verifica histórico recente do lead pra detectar loop em andamento.
 * Se houve >=3 outbound do agente nos últimos 5 minutos sem inbound humano
 * (=inbound com >10 chars que NÃO bate looksLikeAutoReply), está em loop.
 *
 * Usado pelo webhook ANTES de chamar o agente: se em loop, pula execução.
 */
export async function isInActiveLoop(
  campaignLeadId: string,
): Promise<{ inLoop: boolean; outboundCount: number; reason?: string }> {
  const supabase = createServiceClient();
  const sinceIso = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await supabase
    .from("webinar_messages")
    .select("direction, status, sent_text, sent_at")
    .eq("campaign_lead_id", campaignLeadId)
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: true });
  const rows = (data ?? []) as Array<{
    direction: string;
    status: string;
    sent_text: string | null;
    sent_at: string | null;
  }>;
  let outboundCount = 0;
  let humanInboundCount = 0;
  for (const r of rows) {
    if (r.direction === "outbound" && ["sent","delivered","read"].includes(r.status)) {
      outboundCount += 1;
    } else if (r.direction === "inbound") {
      const txt = (r.sent_text ?? "").trim();
      if (txt.length > 10 && !looksLikeAutoReply(txt)) humanInboundCount += 1;
    }
  }
  if (outboundCount >= 3 && humanInboundCount === 0) {
    return {
      inLoop: true,
      outboundCount,
      reason: `${outboundCount} outbound em 5min sem inbound humano real`,
    };
  }
  return { inLoop: false, outboundCount };
}

export async function executeAgentTools(args: {
  campaignLeadId: string;
  toolCalls: AgentToolCall[];
  reasoning?: string;
}): Promise<ExecutionResult> {
  const supabase = createServiceClient();
  const result: ExecutionResult = { ok: true, executed: [] };
  let collectResponsibleDone: { name: string } | null = null;
  let sendMessageCalled = false;
  // Mensagens já enviadas neste turno (pra dedup defensiva)
  const sentTextsThisTurn: string[] = [];

  const { data: lead, error: leadErr } = await supabase
    .from("webinar_campaign_leads")
    .select("*, webinar_campaigns(*)")
    .eq("id", args.campaignLeadId)
    .single();

  if (leadErr || !lead) {
    return {
      ok: false,
      executed: [
        {
          tool: "_load",
          result: "error",
          detail: leadErr?.message ?? "lead não encontrado",
        },
      ],
    };
  }

  const campaign = (lead as any).webinar_campaigns;

  for (const call of args.toolCalls) {
    try {
      switch (call.name) {
        case "send_message": {
          sendMessageCalled = true;
          const text = call.args.text;
          if (!text || typeof text !== "string") {
            result.executed.push({
              tool: "send_message",
              result: "error",
              detail: "texto vazio",
            });
            continue;
          }

          // Dedup defensivo: se já mandamos algo muito parecido neste turno, descarta.
          // OpenAI as vezes faz 2 send_message com texto quase idêntico.
          const dupOfTurn = sentTextsThisTurn.find(
            (prev) => textSimilarity(prev, text) > 0.7,
          );
          if (dupOfTurn) {
            result.executed.push({
              tool: "send_message",
              result: "error",
              detail: `dedup: similar a msg anterior do turno (${text.slice(0, 40)}...)`,
            });
            continue;
          }

          // Dedup HISTÓRICO: olha últimas 8 outbound enviadas a esse lead.
          // Se o agente já mandou algo >70% similar, descarta — evita loop entre turnos
          // (mesmo agente, próximo inbound, agente repete frase).
          const { data: recentOut } = await supabase
            .from("webinar_messages")
            .select("sent_text, sent_at")
            .eq("campaign_lead_id", args.campaignLeadId)
            .eq("direction", "outbound")
            .in("status", ["sent", "delivered", "read"])
            .order("sent_at", { ascending: false })
            .limit(8);
          const dupHistorical = (recentOut ?? []).find(
            (r: any) => r.sent_text && textSimilarity(r.sent_text, text) > 0.7,
          );
          if (dupHistorical) {
            result.executed.push({
              tool: "send_message",
              result: "error",
              detail: `dedup historico: similar a outbound recente (${text.slice(0, 40)}...)`,
            });
            continue;
          }

          // RATE-LIMIT TEMPORAL: protege contra concorrencia.
          // Se houve QUALQUER outbound do agente nos ultimos 6s, descarta.
          // Evita que 2 agentes paralelos (escapados do lock) enviem ao
          // mesmo tempo. 6s e tempo curto suficiente pra nao atrapalhar
          // sequencias humanas legitimas (que tem delay via humanInterMessageDelay).
          const sixSecAgo = new Date(Date.now() - 6_000).toISOString();
          const recentBurst = (recentOut ?? []).find(
            (r: any) => r.sent_at && r.sent_at >= sixSecAgo,
          );
          if (recentBurst && sentTextsThisTurn.length === 0) {
            // Bloqueia APENAS a 1ª msg do turno se houve outbound <6s atras
            // (deixa o turno seguir se ja mandou 1 msg, pra nao quebrar
            // sequencias como saudacao + pitch dentro do mesmo turno)
            result.executed.push({
              tool: "send_message",
              result: "error",
              detail: `rate_limit: outbound <6s atras, possivel concorrencia (skip)`,
            });
            continue;
          }

          // Delay humano entre mensagens consecutivas do MESMO turno.
          // 1ª send_message dispara direto; 2ª+ espera 8-30s baseado em length.
          // Simula tempo natural de "pensar + digitar" entre frases.
          if (sentTextsThisTurn.length > 0) {
            await new Promise((r) =>
              setTimeout(r, humanInterMessageDelay(text)),
            );
          }

          // Lead affinity: tenta usar a última instance que falou com este lead
          const picked = await pickInstance({
            instance_names: campaign.instance_names,
            instance_name: campaign.instance_name,
            preferredInstance: lead.last_instance_used ?? null,
          });
          if (!picked) {
            result.executed.push({
              tool: "send_message",
              result: "error",
              detail: "sem instance disponível",
            });
            continue;
          }

          // Failover: se trocou de instance, manda mensagem-ponte antes
          if (picked.isFailover && picked.preferredInstance) {
            const bridge = "Oi, continuando aqui.";
            const bridgeRes = await sendTextHuman(
              picked.name,
              lead.phone,
              bridge,
            );
            if (bridgeRes.ok) {
              await supabase.from("webinar_messages").insert({
                campaign_lead_id: args.campaignLeadId,
                scheduled_at: new Date().toISOString(),
                status: "sent",
                direction: "outbound",
                category: "agent_reply",
                sent_text: bridge,
                sent_at: new Date().toISOString(),
                ai_generated: true,
                ai_metadata: {
                  type: "failover_bridge",
                  from_instance: picked.preferredInstance,
                  to_instance: picked.name,
                },
                evolution_message_id: bridgeRes.messageId ?? null,
                instance_used: picked.name,
              });
              // Pausa humana entre bridge e msg principal (8-30s, baseado em length)
              await new Promise((r) =>
                setTimeout(r, humanInterMessageDelay(text)),
              );
            }
          }

          const evoRes = await sendTextHuman(
            picked.name,
            lead.phone,
            text,
          );
          if (!evoRes.ok) {
            result.executed.push({
              tool: "send_message",
              result: "error",
              detail: evoRes.error,
            });
            continue;
          }

          await supabase.from("webinar_messages").insert({
            campaign_lead_id: args.campaignLeadId,
            scheduled_at: new Date().toISOString(),
            status: "sent",
            direction: "outbound",
            category: "agent_reply",
            sent_text: text,
            sent_at: new Date().toISOString(),
            ai_generated: true,
            ai_metadata: {
              reasoning: args.reasoning?.slice(0, 1000),
              failover: picked.isFailover,
            },
            evolution_message_id: evoRes.messageId ?? null,
            instance_used: picked.name,
          });

          // Atualiza lead affinity pra próximas mensagens
          await supabase
            .from("webinar_campaign_leads")
            .update({ last_instance_used: picked.name })
            .eq("id", args.campaignLeadId);

          // Registra no rastreio do turno pra dedup das próximas
          sentTextsThisTurn.push(text);

          result.executed.push({
            tool: "send_message",
            result: "ok",
            detail: picked.isFailover ? `failover ${picked.preferredInstance} -> ${picked.name}` : picked.name,
          });
          break;
        }

        case "update_lead_status": {
          const status = call.args.new_status;
          await supabase
            .from("webinar_campaign_leads")
            .update({ funnel_status: status })
            .eq("id", args.campaignLeadId);
          result.executed.push({
            tool: "update_lead_status",
            result: "ok",
            detail: status,
          });
          break;
        }

        case "collect_responsible_info": {
          const { name, email, phone } = call.args;
          if (!name) {
            result.executed.push({
              tool: "collect_responsible_info",
              result: "error",
              detail: "name é obrigatório",
            });
            continue;
          }

          // ── VALIDACAO ANTI-ALUCINACAO ──────────────────────────────────
          // Bug recorrente: LLM chama collect_responsible_info usando
          // company_name como name e lead.phone como phone, marcando o
          // lead como confirmed sem ele ter de fato confirmado nada.

          const norm = (s: string) =>
            s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
          const normName = norm(name);
          const normCompany = norm(lead.company_name ?? "");

          // 1) Nome nao pode ser igual nem substring forte do company_name
          if (
            normCompany &&
            (normName === normCompany ||
              normCompany.includes(normName) ||
              normName.includes(normCompany))
          ) {
            result.executed.push({
              tool: "collect_responsible_info",
              result: "error",
              detail: `nome rejeitado: '${name}' eh similar a company_name '${lead.company_name}' — provavel alucinacao do LLM`,
            });
            continue;
          }

          // 2) Comprimento minimo e maximo razoavel
          if (normName.length < 3 || normName.length > 80) {
            result.executed.push({
              tool: "collect_responsible_info",
              result: "error",
              detail: `nome rejeitado: comprimento ${normName.length} fora do range (3-80)`,
            });
            continue;
          }

          // 3) Lista negra de "nao-nomes": palavras que claramente nao sao
          //    nomes de pessoa, sao setores/cargos/descricoes
          const BLACKLIST_NAMES = new Set([
            "parte",
            "parte juridica",
            "juridica",
            "juridico",
            "responsavel",
            "responsable",
            "gestor",
            "gestora",
            "dono",
            "dona",
            "atendente",
            "secretaria",
            "secretario",
            "comercial",
            "veterinario",
            "veterinaria",
            "clinica",
            "equipe",
            "financeiro",
            "administracao",
            "suporte",
            "contato",
            "recepcao",
            "rh",
            "marketing",
            "vendas",
            "tecnica",
            "tecnico",
            "diretor",
            "diretora",
            "coordenador",
            "coordenadora",
            "supervisor",
            "supervisora",
            "gerente",
            "encarregado",
            "encarregada",
          ]);
          if (BLACKLIST_NAMES.has(normName)) {
            result.executed.push({
              tool: "collect_responsible_info",
              result: "error",
              detail: `nome rejeitado: '${name}' e cargo/setor, nao nome de pessoa`,
            });
            continue;
          }

          // 4) Phone nao pode ser igual ao phone do lead atual
          //    (LLM as vezes copia leadPhone como se fosse direct_phone)
          if (phone) {
            const onlyDigitsA = phone.replace(/\D/g, "");
            const onlyDigitsB = (lead.phone ?? "").replace(/\D/g, "");
            if (onlyDigitsA && onlyDigitsA === onlyDigitsB) {
              result.executed.push({
                tool: "collect_responsible_info",
                result: "error",
                detail: `phone rejeitado: igual ao phone do lead (LLM provavelmente alucinou)`,
              });
              continue;
            }
          }

          // 3) Pra marcar confirmed precisa que a conversa ja tenha pitch
          //    mencionando o evento (data + hora). Sem isso, recusa.
          const histText = (ctx as any).__rawHistoryText ?? "";
          // ────────────────────────────────────────────────────────────────

          const updates: any = { responsible_name: name };
          if (email) updates.responsible_email = email;
          if (phone) updates.responsible_direct_phone = phone;

          // Se tem nome + (email OU phone), confirma e agenda cadência
          const isComplete = !!name && (!!email || !!phone);

          // 4) Confirmacao so se houve pitch real
          //    Pesquisa no historico recente menos restritivo: precisa ter
          //    alguma menção a evento/data/aula/webinar em outbound do bot.
          let pitchOk = true;
          if (isComplete) {
            const { data: recentOut } = await supabase
              .from("webinar_messages")
              .select("sent_text")
              .eq("campaign_lead_id", args.campaignLeadId)
              .eq("direction", "outbound")
              .in("status", ["sent", "delivered", "read"])
              .order("sent_at", { ascending: false })
              .limit(10);
            const allText = (recentOut ?? [])
              .map((r: any) => r.sent_text ?? "")
              .join(" ");
            // Sinal de pitch: bot precisa ter mandado algo sobre o evento.
            // Aceita 'evento', 'aula', 'webinar', 'dia X', 'às H', menção a data/hora.
            pitchOk =
              /evento|aula|webinar|present[a-z]+|dia\s+\d|às?\s+\d/i.test(allText);
            if (!pitchOk) {
              result.executed.push({
                tool: "collect_responsible_info",
                result: "error",
                detail: `recusa: conversa nao tem pitch do evento ainda — nao marca confirmed`,
              });
              continue;
            }
          }

          if (isComplete) {
            updates.funnel_status = "confirmed";
            collectResponsibleDone = { name };
          }

          await supabase
            .from("webinar_campaign_leads")
            .update(updates)
            .eq("id", args.campaignLeadId);

          result.executed.push({
            tool: "collect_responsible_info",
            result: "ok",
            detail: `name=${name}${email ? ", email=" + email : ""}${phone ? ", phone=" + phone : ""}${isComplete ? " (confirmed)" : ""}`,
          });

          if (isComplete && campaign.cadence_enabled === true) {
            // Agenda cadência de lembretes (SOMENTE se campanha habilitar)
            try {
              const { data: freshLead } = await supabase
                .from("webinar_campaign_leads")
                .select("*")
                .eq("id", args.campaignLeadId)
                .single();
              const leadForCadence = freshLead ?? { ...lead, ...updates };
              await scheduleReminderCadenceForLead(supabase, leadForCadence, campaign);
              result.executed.push({
                tool: "_schedule_reminders",
                result: "ok",
              });
            } catch (e: any) {
              result.executed.push({
                tool: "_schedule_reminders",
                result: "error",
                detail: e?.message,
              });
            }
          } else if (isComplete) {
            // Cadência desativada — só registra que NÃO agendou
            result.executed.push({
              tool: "_schedule_reminders",
              result: "ok",
              detail: "skipped: cadence_enabled=false (controle manual)",
            });
          }

          break;
        }

        case "schedule_followup": {
          const { hours_from_now, content } = call.args;
          const at = new Date(Date.now() + hours_from_now * 3600_000);
          await supabase.from("webinar_messages").insert({
            campaign_lead_id: args.campaignLeadId,
            scheduled_at: at.toISOString(),
            status: "pending",
            direction: "outbound",
            category: "agent_reply",
            sent_text: content,
            ai_generated: true,
            ai_metadata: { type: "followup_scheduled_by_agent" },
          });
          result.executed.push({
            tool: "schedule_followup",
            result: "ok",
            detail: `${hours_from_now}h`,
          });
          break;
        }

        case "escalate_to_human": {
          await supabase
            .from("webinar_campaign_leads")
            .update({
              funnel_status: "escalated",
              notes: `[ESCALATED] ${call.args.reason}`,
            })
            .eq("id", args.campaignLeadId);
          result.executed.push({
            tool: "escalate_to_human",
            result: "ok",
            detail: call.args.reason,
          });

          // Notifica o diretor via WhatsApp
          try {
            const lastInbound = [...(lead as any).webinar_messages ?? []]
              .reverse()
              .find((m: any) => m.direction === "inbound");

            // Busca última mensagem inbound direto do banco (lead não vem com messages)
            const { data: lastMsgs } = await supabase
              .from("webinar_messages")
              .select("sent_text")
              .eq("campaign_lead_id", args.campaignLeadId)
              .eq("direction", "inbound")
              .order("created_at", { ascending: false })
              .limit(1);

            const ultimaMsg = lastMsgs?.[0]?.sent_text ?? "(sem texto)";
            const empresa = lead.company_name ?? "desconhecida";
            const telefone = lead.phone ?? "";

            const notifText =
              `*Escalado para humano* — Webinar\n\n` +
              `Empresa: ${empresa}\n` +
              `Telefone: ${telefone}\n` +
              `Ultima mensagem do lead: "${ultimaMsg}"\n\n` +
              `Motivo: ${call.args.reason}`;

            const pickedNotif = await pickInstance({
              instance_names: campaign.instance_names,
              instance_name: campaign.instance_name,
              preferredInstance: lead.last_instance_used ?? null,
            });

            if (pickedNotif) {
              await sendTextViaEvolution(pickedNotif.name, "5537999577862", notifText);
            }
          } catch (notifErr: any) {
            console.error("[agent-executor] falha ao notificar diretor:", notifErr?.message);
          }

          break;
        }

        case "mark_as_lost": {
          await supabase
            .from("webinar_campaign_leads")
            .update({
              funnel_status: "lost",
              loss_reason: call.args.reason,
            })
            .eq("id", args.campaignLeadId);
          result.executed.push({
            tool: "mark_as_lost",
            result: "ok",
            detail: call.args.reason,
          });
          break;
        }

        case "forward_to_responsible": {
          // Intermediário passou WhatsApp do responsável real.
          // Cria lead novo na mesma campanha + dispara mensagem inicial
          // contextualizada ("X da empresa Y me passou seu contato").
          // Marca intermediário como lost('intermediary_passed_contact').
          const {
            responsible_phone: rawPhone,
            responsible_name: respName,
            intermediary_company: interCompany,
          } = call.args;

          const normalized = normalizeBrazilianPhone(rawPhone);
          if (!normalized) {
            result.executed.push({
              tool: "forward_to_responsible",
              result: "error",
              detail: `phone inválido: "${rawPhone}"`,
            });
            break;
          }

          // Dedup: já existe lead com esse phone nesta campanha?
          const { data: existing } = await supabase
            .from("webinar_campaign_leads")
            .select("id, company_name, funnel_status")
            .eq("campaign_id", campaign.id)
            .eq("phone", normalized)
            .maybeSingle();

          // Affinity: lead novo herda o MESMO chip que falou com o intermediario.
          // Garante continuidade visual pro responsavel (so vai trocar de chip se
          // o original cair). Sem isso, o lead da Bruna receberia mensagem de um
          // chip aleatorio e o "Yuri Garcia" apareceria de um numero diferente
          // do que o intermediario indicou — quebra de confianca.
          const inheritedInstance = lead.last_instance_used ?? null;

          let newLeadId: string;
          let isExisting = false;
          if (existing) {
            newLeadId = existing.id;
            isExisting = true;
            // Se o lead ja existe mas sem affinity, herda do intermediario agora
            if (inheritedInstance && !(existing as any).last_instance_used) {
              await supabase
                .from("webinar_campaign_leads")
                .update({ last_instance_used: inheritedInstance })
                .eq("id", newLeadId);
            }
          } else {
            // Cria lead novo. company_name = "Indicado por {intermediary_company}"
            // pra rastrear origem.
            const empresaIntermediario = interCompany || lead.company_name || "(empresa)";
            const novoLeadCompany = `Indicado por ${empresaIntermediario}`;
            const { data: novo, error: novoErr } = await supabase
              .from("webinar_campaign_leads")
              .insert({
                campaign_id: campaign.id,
                phone: normalized,
                company_name: novoLeadCompany,
                responsible_name: respName ?? null,
                funnel_status: "scraped",
                // Lead novo ja nasce com affinity do intermediario
                last_instance_used: inheritedInstance,
                notes: `Encaminhado via lead ${args.campaignLeadId} (${empresaIntermediario})`,
              })
              .select("id")
              .single();
            if (novoErr || !novo) {
              result.executed.push({
                tool: "forward_to_responsible",
                result: "error",
                detail: novoErr?.message ?? "falha criando lead novo",
              });
              break;
            }
            newLeadId = novo.id;
          }

          // Mensagem inicial contextualizada (NÃO a saudação genérica)
          const empresaIntermediarioMsg =
            interCompany || lead.company_name || "a clínica veterinária";
          const saudacaoNome = respName ? `, ${getFirstName(respName)}` : "";
          const initialText =
            `Olá${saudacaoNome}, tudo bem? Aqui é o Yuri Garcia, do Grupo NG.\n\n` +
            `Quem atende o WhatsApp da ${empresaIntermediarioMsg} me passou teu contato pra falar diretamente. ` +
            `Tô formalizando um convite pra um evento online focado em donos de clínica veterinária. ` +
            `Posso te explicar rápido?`;

          // Tenta enviar imediatamente — usa o chip herdado como preferred.
          // Se ele estiver disponivel (open + cooldown ok + cap ok), pickInstance
          // usa ele. So troca se cair ou esgotar.
          const picked = await pickInstance({
            instance_names: campaign.instance_names,
            instance_name: campaign.instance_name,
            preferredInstance: inheritedInstance,
          });

          if (picked) {
            const evoRes = await sendTextHuman(picked.name, normalized, initialText);
            if (evoRes.ok) {
              await supabase.from("webinar_messages").insert({
                campaign_lead_id: newLeadId,
                scheduled_at: new Date().toISOString(),
                status: "sent",
                direction: "outbound",
                // Categoria 'forwarded_initial' NAO entra em RATE_LIMITED_CATEGORIES.
                // Diferente de saudacao em massa, esta e continuidade de conversa:
                // intermediario indicou o responsavel direto. Tem que usar o
                // mesmo chip e nao respeitar cap/cooldown (sao poucos disparos).
                category: "forwarded_initial",
                sent_text: initialText,
                sent_at: new Date().toISOString(),
                ai_generated: true,
                ai_metadata: {
                  type: "forwarded_from_intermediary",
                  forwarded_from_lead: args.campaignLeadId,
                  intermediary_company: empresaIntermediarioMsg,
                },
                evolution_message_id: evoRes.messageId ?? null,
                instance_used: picked.name,
              });
              await supabase
                .from("webinar_campaign_leads")
                .update({
                  last_instance_used: picked.name,
                  funnel_status: "pending_response",
                })
                .eq("id", newLeadId);
            } else {
              // Falhou envio imediato. Salva como pending pra cron disparar.
              await supabase.from("webinar_messages").insert({
                campaign_lead_id: newLeadId,
                scheduled_at: new Date().toISOString(),
                status: "pending",
                direction: "outbound",
                category: "forwarded_initial",
                sent_text: initialText,
                ai_metadata: {
                  type: "forwarded_from_intermediary_fallback",
                  forwarded_from_lead: args.campaignLeadId,
                  intermediary_company: empresaIntermediarioMsg,
                },
              });
            }
          } else {
            await supabase.from("webinar_messages").insert({
              campaign_lead_id: newLeadId,
              scheduled_at: new Date().toISOString(),
              status: "pending",
              direction: "outbound",
              category: "forwarded_initial",
              sent_text: initialText,
              ai_metadata: {
                type: "forwarded_from_intermediary_no_instance",
                forwarded_from_lead: args.campaignLeadId,
                intermediary_company: empresaIntermediarioMsg,
              },
            });
          }

          // Marca intermediário como lost
          await supabase
            .from("webinar_campaign_leads")
            .update({
              funnel_status: "lost",
              loss_reason: "intermediary_passed_contact",
              notes: `Passou contato do responsável (${normalized})${respName ? ` - ${respName}` : ""}. Lead novo: ${newLeadId}`,
            })
            .eq("id", args.campaignLeadId);

          result.executed.push({
            tool: "forward_to_responsible",
            result: "ok",
            detail: `${isExisting ? "lead existente" : "lead novo"} ${newLeadId} (phone ${normalized})`,
          });
          break;
        }

        default:
          result.executed.push({
            tool: (call as any).name ?? "unknown",
            result: "error",
            detail: "tool desconhecida",
          });
      }
    } catch (e: any) {
      result.executed.push({
        tool: call.name,
        result: "error",
        detail: e?.message ?? "exception",
      });
    }
  }

  // Fallback defensivo: se agente chamou collect_responsible_info com dados completos
  // mas esqueceu o send_message, envia confirmação automaticamente.
  if (collectResponsibleDone && !sendMessageCalled) {
    console.warn("[agent-executor] FALLBACK: collect_responsible_info sem send_message — enviando confirmação automática");
    try {
      const firstName = collectResponsibleDone.name.split(" ")[0];
      const confirmText = `Show ${firstName}, anotado. Te mando o link uns dias antes do evento.`;

      const picked = await pickInstance({
        instance_names: campaign.instance_names,
        instance_name: campaign.instance_name,
        preferredInstance: lead.last_instance_used ?? null,
      });

      if (picked) {
        const evoRes = await sendTextHuman(picked.name, lead.phone, confirmText);
        if (evoRes.ok) {
          await supabase.from("webinar_messages").insert({
            campaign_lead_id: args.campaignLeadId,
            scheduled_at: new Date().toISOString(),
            status: "sent",
            direction: "outbound",
            category: "agent_reply",
            sent_text: confirmText,
            sent_at: new Date().toISOString(),
            ai_generated: true,
            ai_metadata: { type: "auto_confirmation_fallback", reasoning: args.reasoning?.slice(0, 500) },
            evolution_message_id: evoRes.messageId ?? null,
            instance_used: picked.name,
          });
          await supabase
            .from("webinar_campaign_leads")
            .update({ last_instance_used: picked.name })
            .eq("id", args.campaignLeadId);
        }
        result.executed.push({
          tool: "_auto_confirmation",
          result: evoRes.ok ? "ok" : "error",
          detail: evoRes.ok ? `fallback enviado via ${picked.name}` : evoRes.error,
        });
      } else {
        result.executed.push({ tool: "_auto_confirmation", result: "error", detail: "sem instance disponível" });
      }
    } catch (e: any) {
      result.executed.push({ tool: "_auto_confirmation", result: "error", detail: e?.message });
    }
  }

  return result;
}

/**
 * Agenda os steps da cadência de lembretes baseado em quanto falta pro evento.
 * Chamada automaticamente quando lead vira `confirmed`.
 */
async function scheduleReminderCadenceForLead(
  supabase: ReturnType<typeof createServiceClient>,
  lead: any,
  campaign: any,
) {
  if (!campaign.event_date) {
    throw new Error("campanha sem event_date — não dá pra agendar lembretes");
  }
  if (!campaign.theme) {
    throw new Error("campanha sem tema — não dá pra renderizar templates");
  }

  const eventDate = new Date(campaign.event_date);
  const confirmedAt = new Date();
  const profile = pickReminderProfile(eventDate, confirmedAt);
  const steps = REMINDER_PROFILES[profile];
  const scheduled = scheduleReminderSteps(steps, eventDate, confirmedAt);

  if (scheduled.length === 0) return;

  const dataFmt = eventDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
  const horaFmt = eventDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const primeiroNome = getFirstName(lead.responsible_name);
  const empresa = lead.company_name ?? "tua clínica";

  const rows = scheduled.map(({ step, scheduledAt }) => ({
    campaign_lead_id: lead.id,
    scheduled_at: scheduledAt.toISOString(),
    status: "pending",
    direction: "outbound",
    category: step.category,
    sent_text: renderTemplate(step.template, {
      primeiro_nome: primeiroNome,
      empresa,
      tema: campaign.theme,
      data: dataFmt,
      hora: horaFmt,
      meet_link: campaign.meet_link ?? "",
      cal_link: campaign.cal_link ?? "",
    }),
    ai_metadata: {
      reminder_profile: profile,
      step_label: step.label,
      branch: step.branch ?? null,
    },
  }));

  await supabase.from("webinar_messages").insert(rows);
}
