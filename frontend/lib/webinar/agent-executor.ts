/**
 * Executa as tool calls retornadas pelo agente Gemini.
 * Esta funcao roda no servidor e atualiza Supabase + Evolution.
 */

import { createClient } from "@/utils/supabase/server";
import {
  pickInstance,
  sendTextViaEvolution,
} from "./evolution";
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
  const supabase = await createClient();
  const result: ExecutionResult = { ok: true, executed: [] };

  // Carrega lead + campaign uma vez
  const { data: lead, error: leadErr } = await supabase
    .from("webinar_campaign_leads")
    .select("*, webinar_campaigns(*)")
    .eq("id", args.campaignLeadId)
    .single();

  if (leadErr || !lead) {
    return {
      ok: false,
      executed: [
        { tool: "_load", result: "error", detail: leadErr?.message ?? "lead nao encontrado" },
      ],
    };
  }

  const campaign = (lead as any).webinar_campaigns;

  for (const call of args.toolCalls) {
    try {
      switch (call.name) {
        case "send_message": {
          const text = call.args.text;
          if (!text || typeof text !== "string") {
            result.executed.push({
              tool: "send_message",
              result: "error",
              detail: "text vazio",
            });
            continue;
          }

          const instance = await pickInstance({
            instance_names: campaign.instance_names,
            instance_name: campaign.instance_name,
          });
          if (!instance) {
            result.executed.push({
              tool: "send_message",
              result: "error",
              detail: "sem instance",
            });
            continue;
          }

          const evoRes = await sendTextViaEvolution(
            instance,
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
            sent_text: text,
            sent_at: new Date().toISOString(),
            ai_generated: true,
            ai_metadata: { reasoning: args.reasoning?.slice(0, 1000) },
            evolution_message_id: evoRes.messageId ?? null,
            instance_used: instance,
          });

          result.executed.push({ tool: "send_message", result: "ok" });
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

        case "schedule_followup": {
          const { hours_from_now, content } = call.args;
          const at = new Date(Date.now() + hours_from_now * 3600_000);
          await supabase.from("webinar_messages").insert({
            campaign_lead_id: args.campaignLeadId,
            scheduled_at: at.toISOString(),
            status: "pending",
            direction: "outbound",
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
              loss_reason: null,
              notes: `[ESCALATED] ${call.args.reason}`,
            })
            .eq("id", args.campaignLeadId);
          result.executed.push({
            tool: "escalate_to_human",
            result: "ok",
            detail: call.args.reason,
          });
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

  return result;
}
