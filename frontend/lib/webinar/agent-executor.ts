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
import { pickInstance, sendTextViaEvolution } from "./evolution";
import {
  REMINDER_PROFILES,
  pickReminderProfile,
  scheduleReminderSteps,
  renderTemplate,
  getFirstName,
} from "./cadences";
import type { AgentToolCall } from "./gemini-agent";

export type ExecutionResult = {
  ok: boolean;
  executed: Array<{ tool: string; result: "ok" | "error"; detail?: string }>;
};

export async function executeAgentTools(args: {
  campaignLeadId: string;
  toolCalls: AgentToolCall[];
  reasoning?: string;
}): Promise<ExecutionResult> {
  const supabase = createServiceClient();
  const result: ExecutionResult = { ok: true, executed: [] };
  let collectResponsibleDone: { name: string } | null = null;
  let sendMessageCalled = false;

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
            const bridge = "Oi, voltei aqui (tive um problema no outro número). Continuando nossa conversa.";
            const bridgeRes = await sendTextViaEvolution(
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
              // Pequena pausa entre bridge e msg principal pra parecer humano
              await new Promise((r) => setTimeout(r, 3500));
            }
          }

          const evoRes = await sendTextViaEvolution(
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

          const updates: any = { responsible_name: name };
          if (email) updates.responsible_email = email;
          if (phone) updates.responsible_direct_phone = phone;

          // Se tem nome + (email OU phone), confirma e agenda cadência
          const isComplete = !!name && (!!email || !!phone);
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

          if (isComplete) {
            // Agenda cadência de lembretes
            try {
              await scheduleReminderCadenceForLead(supabase, lead, campaign);
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
        const evoRes = await sendTextViaEvolution(picked.name, lead.phone, confirmText);
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
