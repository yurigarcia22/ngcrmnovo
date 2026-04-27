/**
 * Webhook Evolution — recebe eventos do WhatsApp.
 *
 * Fluxo:
 *   1. Valida evento, extrai JID/phone
 *   2. Checa idempotência, busca lead, salva inbound
 *   3. Retorna 200 imediatamente (< 200ms) — Evolution não timeout
 *   4. Roda agente Gemini em background (Node.js event loop mantém vivo)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { runAgent } from "@/lib/webinar/gemini-agent";
import { executeAgentTools } from "@/lib/webinar/agent-executor";
import type { AgentContext } from "@/lib/webinar/agent-prompt";
import { pickInstance, sendTextViaEvolution } from "@/lib/webinar/evolution";

export const dynamic = "force-dynamic";

function jidToPhone(jid: string): string {
  return jid.split("@")[0];
}

function phoneVariations(phone: string): string[] {
  const variations = new Set<string>();
  variations.add(phone);

  if (phone.startsWith("55") && phone.length === 12) {
    const ddd = phone.slice(2, 4);
    const rest = phone.slice(4);
    variations.add(`55${ddd}9${rest}`);
  }
  if (phone.startsWith("55") && phone.length === 13) {
    const ddd = phone.slice(2, 4);
    const after9 = phone.slice(5);
    variations.add(`55${ddd}${after9}`);
  }

  return Array.from(variations);
}

const FALLBACK_MESSAGE =
  "Isso foge um pouco do que consigo responder por políticas da empresa. Mas se tiver dúvida sobre o evento, pode perguntar à vontade.";

const ERROR_FALLBACK_MESSAGE =
  "Tô com uma instabilidade aqui, me dá um minuto que eu volto.";

async function sendEmergencyFallback(
  campaignLeadId: string,
  text: string,
): Promise<void> {
  const supabase = createServiceClient();
  try {
    const { data: lead } = await supabase
      .from("webinar_campaign_leads")
      .select("*, webinar_campaigns(*)")
      .eq("id", campaignLeadId)
      .single();
    if (!lead) return;
    const campaign = (lead as any).webinar_campaigns;
    const picked = await pickInstance({
      instance_names: campaign?.instance_names,
      instance_name: campaign?.instance_name,
      preferredInstance: lead.last_instance_used ?? null,
    });
    if (!picked) return;
    const evoRes = await sendTextViaEvolution(picked.name, lead.phone, text);
    if (evoRes.ok) {
      await supabase.from("webinar_messages").insert({
        campaign_lead_id: campaignLeadId,
        scheduled_at: new Date().toISOString(),
        status: "sent",
        direction: "outbound",
        category: "agent_reply",
        sent_text: text,
        sent_at: new Date().toISOString(),
        ai_generated: true,
        ai_metadata: { type: "emergency_fallback" },
        evolution_message_id: evoRes.messageId ?? null,
        instance_used: picked.name,
      });
      await supabase
        .from("webinar_campaign_leads")
        .update({ last_instance_used: picked.name })
        .eq("id", campaignLeadId);
    }
  } catch (fallbackErr: any) {
    console.error("[webhook evolution] [bg] EMERGENCY FALLBACK falhou:", fallbackErr?.message);
  }
}

async function runAgentBackground(campaignLeadId: string, ctx: AgentContext) {
  const supabase = createServiceClient();
  let decisionMade = false;
  try {
    console.log("[webhook evolution] [bg] iniciando agente lead=" + campaignLeadId);

    // Timeout de 25s no Gemini — se travar, dispara fallback
    const decision = await Promise.race([
      runAgent(ctx),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("gemini_timeout_25s")), 25_000),
      ),
    ]);

    decisionMade = true;
    console.log(
      "[webhook evolution] [bg] agente decidiu " +
        decision.toolCalls.length +
        " tool calls: " +
        decision.toolCalls.map((c) => c.name).join(","),
    );

    if (decision.toolCalls.length === 0) {
      console.warn("[webhook evolution] [bg] AVISO: agente retornou 0 tool calls — injetando resposta padrao");
      decision.toolCalls = [
        {
          name: "send_message",
          args: { text: FALLBACK_MESSAGE },
        },
      ];
    }

    const exec = await executeAgentTools({
      campaignLeadId,
      toolCalls: decision.toolCalls,
      reasoning: decision.reasoning,
    });
    console.log(
      "[webhook evolution] [bg] executor: " +
        exec.executed.map((e) => e.tool + "=" + e.result).join(","),
    );

    // Verifica se ALGUMA send_message foi enviada com sucesso
    const sentOk = exec.executed.some(
      (e) => (e.tool === "send_message" || e.tool === "_auto_confirmation") && e.result === "ok",
    );
    if (!sentOk) {
      console.warn("[webhook evolution] [bg] nenhum send_message ok — disparando emergency fallback");
      await sendEmergencyFallback(campaignLeadId, FALLBACK_MESSAGE);
    }

    await supabase
      .from("webinar_campaign_leads")
      .update({ last_interaction_at: new Date().toISOString() })
      .eq("id", campaignLeadId);
  } catch (e: any) {
    console.error("[webhook evolution] [bg] erro no agente:", e?.message, e?.stack);
    // Catch-all final: sempre envia algo pro lead
    if (!decisionMade) {
      await sendEmergencyFallback(campaignLeadId, ERROR_FALLBACK_MESSAGE);
    } else {
      await sendEmergencyFallback(campaignLeadId, FALLBACK_MESSAGE);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log("[webhook evolution] >>> RECEBIDO POST <<<");
    const body = await req.json();

    const event = body?.event ?? body?.event_type;
    console.log("[webhook evolution] event=" + event + " instance=" + (body?.instance ?? "(sem instance)"));

    if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") {
      console.log("[webhook evolution] ignorando event=" + event);
      return NextResponse.json({ ok: true, ignored: event });
    }

    const data = body?.data ?? body;
    const key = data?.key ?? {};
    const fromMe = key?.fromMe ?? false;
    if (fromMe) {
      console.log("[webhook evolution] ignorando: fromMe=true jid=" + (key?.remoteJid ?? "?"));
      return NextResponse.json({ ok: true, ignored: "fromMe" });
    }

    const remoteJid: string = key?.remoteJid ?? "";
    const senderPn: string | null = key?.senderPn ?? null;
    const effectiveJid = remoteJid.endsWith("@lid") && senderPn ? senderPn : remoteJid;
    const messageId: string | undefined = key?.id;
    const instanceName: string = body?.instance ?? data?.instance ?? "";

    console.log("[webhook evolution] jid=" + effectiveJid + " msgId=" + messageId + " instance=" + instanceName);

    if (!effectiveJid) {
      console.log("[webhook evolution] ignorando: sem jid");
      return NextResponse.json({ ok: false, error: "no remoteJid nor senderPn" });
    }

    const message = data?.message ?? {};
    const msgKeys = Object.keys(message);
    const text =
      message?.conversation ??
      message?.extendedTextMessage?.text ??
      message?.imageMessage?.caption ??
      message?.videoMessage?.caption ??
      "";

    const isAudio = !!(message?.audioMessage || message?.pttMessage);

    console.log(
      "[webhook evolution] tipos=" + msgKeys.join(",") +
      " text=" + (text ? text.slice(0, 40) : "(vazio)") +
      " isAudio=" + isAudio,
    );

    if (!text && !isAudio) {
      console.log("[webhook evolution] ignorando: tipo sem texto (" + msgKeys.join(",") + ")");
      return NextResponse.json({ ok: true, ignored: "no_text_in_message", msgTypes: msgKeys });
    }

    const effectiveText = text || "[lead enviou áudio — não consigo ouvir, precisa pedir pra digitar]";
    const phone = jidToPhone(effectiveJid);
    const phones = phoneVariations(phone);

    const supabase = createServiceClient();

    // Idempotência
    if (messageId) {
      const { data: dup } = await supabase
        .from("webinar_messages")
        .select("id")
        .eq("evolution_message_id", messageId)
        .limit(1);
      if (dup && dup.length > 0) {
        console.log("[webhook evolution] ignorando: duplicate msgId=" + messageId);
        return NextResponse.json({ ok: true, ignored: "duplicate_message" });
      }
    }

    const { data: leads } = await supabase
      .from("webinar_campaign_leads")
      .select("*, webinar_campaigns!inner(*)")
      .in("phone", phones)
      .order("last_interaction_at", { ascending: false, nullsFirst: false })
      .limit(1);

    const lead = leads?.[0] as any;
    if (!lead) {
      console.log("[webhook evolution] ignorando: lead_not_found phones=" + phones.join(","));
      return NextResponse.json({ ok: true, ignored: "lead_not_found", phones });
    }

    // Salva inbound
    await supabase.from("webinar_messages").insert({
      campaign_lead_id: lead.id,
      scheduled_at: new Date().toISOString(),
      status: "replied",
      direction: "inbound",
      sent_text: effectiveText,
      sent_at: new Date().toISOString(),
      evolution_message_id: messageId ?? null,
      instance_used: instanceName ?? null,
    });

    // Atualiza status se necessário
    const cur = lead.funnel_status;
    if (cur === "invited" || cur === "viewed" || cur === "scraped" || cur === "enriched") {
      await supabase
        .from("webinar_campaign_leads")
        .update({ funnel_status: "replied" })
        .eq("id", lead.id);
    }

    // Carrega histórico
    const { data: history } = await supabase
      .from("webinar_messages")
      .select("direction, sent_text, created_at")
      .eq("campaign_lead_id", lead.id)
      .order("created_at", { ascending: true });

    const campaign = lead.webinar_campaigns;
    const eventDate = campaign.event_date ? new Date(campaign.event_date) : null;

    const ctx: AgentContext = {
      campaignName: campaign.name,
      theme: campaign.theme,
      eventDate: campaign.event_date,
      eventDateFormatted: eventDate
        ? eventDate.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            timeZone: "America/Sao_Paulo",
          })
        : null,
      eventHourFormatted: eventDate
        ? eventDate.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          })
        : null,
      meetLink: campaign.meet_link,
      offerDescription: campaign.offer_description,
      calLink: campaign.cal_link,
      companyName: lead.company_name,
      responsibleName: lead.responsible_name ?? null,
      responsibleEmail: lead.responsible_email ?? null,
      responsibleDirectPhone: lead.responsible_direct_phone ?? null,
      leadPhone: lead.phone,
      funnelStatus: lead.funnel_status,
      conversationHistory: (history ?? []).map((h: any) => ({
        direction: h.direction,
        content: h.sent_text ?? "",
        createdAt: h.created_at,
      })),
    };

    // IA pausada manualmente pelo operador — ignora agente
    if (lead.ai_paused) {
      console.log("[webhook evolution] lead=" + lead.id + " ai_paused=true — agente ignorado");
      return NextResponse.json({ ok: true, skipped: "ai_paused", leadId: lead.id });
    }

    console.log("[webhook evolution] lead=" + lead.id + " status=" + cur + " msgs=" + (history?.length ?? 0) + " — agente em background");

    // RETORNA 200 IMEDIATAMENTE — Evolution não espera mais
    // O agente roda no event loop do Node.js (não edge runtime, não serverless)
    void runAgentBackground(lead.id, ctx);

    return NextResponse.json({ ok: true, agent: "background", leadId: lead.id });
  } catch (e: any) {
    console.error("[webhook evolution] erro", e?.message, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message ?? "erro" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "webhook evolution" });
}
