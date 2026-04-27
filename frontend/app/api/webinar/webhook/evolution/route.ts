/**
 * Webhook Evolution — recebe eventos do WhatsApp.
 *
 * Configurar na Evolution:
 *   POST {EVOLUTION_URL}/webhook/set/{instanceName}
 *   body: { url: "https://SEU_DOMINIO/api/webinar/webhook/evolution", events: ["MESSAGES_UPSERT"] }
 *
 * Quando lead responde, este endpoint:
 *   1. Identifica o lead via phone+instance
 *   2. Salva inbound em webinar_messages
 *   3. Chama o agente Gemini
 *   4. Executa tools (send_message etc)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { runAgent } from "@/lib/webinar/gemini-agent";
import { executeAgentTools } from "@/lib/webinar/agent-executor";
import type { AgentContext } from "@/lib/webinar/agent-prompt";

export const dynamic = "force-dynamic";

function jidToPhone(jid: string): string {
  // Ex: "5537999577862@s.whatsapp.net" -> "5537999577862"
  return jid.split("@")[0];
}

function phoneVariations(phone: string): string[] {
  // WhatsApp Brasil tem o quirk do 9 inicial. Gera variacoes.
  const variations = new Set<string>();
  variations.add(phone);

  if (phone.startsWith("55") && phone.length === 12) {
    // 55 + DDD + 8 digits — adiciona versao com 9
    const ddd = phone.slice(2, 4);
    const rest = phone.slice(4);
    variations.add(`55${ddd}9${rest}`);
  }
  if (phone.startsWith("55") && phone.length === 13) {
    // 55 + DDD + 9 + 8 digits — adiciona versao sem 9
    const ddd = phone.slice(2, 4);
    const after9 = phone.slice(5);
    variations.add(`55${ddd}${after9}`);
  }

  return Array.from(variations);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Evolution v2 manda em formato { event, instance, data }
    const event = body?.event ?? body?.event_type;
    if (event !== "messages.upsert" && event !== "MESSAGES_UPSERT") {
      return NextResponse.json({ ok: true, ignored: event });
    }

    const data = body?.data ?? body;
    const key = data?.key ?? {};
    const fromMe = key?.fromMe ?? false;
    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: "fromMe" });
    }

    const remoteJid: string = key?.remoteJid ?? "";
    const senderPn: string | null = key?.senderPn ?? null;
    const effectiveJid =
      remoteJid.endsWith("@lid") && senderPn ? senderPn : remoteJid;
    const messageId: string | undefined = key?.id;
    const instanceName: string = body?.instance ?? data?.instance ?? "";

    if (!effectiveJid) {
      return NextResponse.json({
        ok: false,
        error: "no remoteJid nor senderPn",
      });
    }

    const message = data?.message ?? {};
    const text =
      message?.conversation ??
      message?.extendedTextMessage?.text ??
      message?.imageMessage?.caption ??
      "";

    if (!text) {
      return NextResponse.json({ ok: true, ignored: "no_text_in_message" });
    }

    const phone = jidToPhone(effectiveJid);
    const phones = phoneVariations(phone);

    const supabase = createServiceClient();

    // Idempotência: se já processamos essa msg do Evolution, ignora silenciosamente.
    // Evolution faz retry quando webhook demora a responder; o ack vai chegar várias vezes
    // pra mesma mensagem com o mesmo evolution_message_id.
    if (messageId) {
      const { data: dup } = await supabase
        .from("webinar_messages")
        .select("id")
        .eq("evolution_message_id", messageId)
        .limit(1);
      if (dup && dup.length > 0) {
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
      return NextResponse.json({
        ok: true,
        ignored: "lead_not_found",
        phones,
      });
    }

    // Salva inbound
    await supabase.from("webinar_messages").insert({
      campaign_lead_id: lead.id,
      scheduled_at: new Date().toISOString(),
      status: "replied",
      direction: "inbound",
      sent_text: text,
      sent_at: new Date().toISOString(),
      evolution_message_id: messageId ?? null,
      instance_used: instanceName ?? null,
    });

    // Atualiza status do lead se ainda estiver invited/viewed
    const cur = lead.funnel_status;
    if (cur === "invited" || cur === "viewed" || cur === "scraped" || cur === "enriched") {
      await supabase
        .from("webinar_campaign_leads")
        .update({ funnel_status: "replied" })
        .eq("id", lead.id);
    }

    // Carrega historico completo
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
      leadPhone: lead.phone,
      funnelStatus: lead.funnel_status,
      conversationHistory: (history ?? []).map((h: any) => ({
        direction: h.direction,
        content: h.sent_text ?? "",
        createdAt: h.created_at,
      })),
    };

    // Processamento síncrono. Gemini Flash leva 3-6s, dentro do timeout do
    // Evolution (~10s). Background async não funciona em todos ambientes
    // (Next.js standalone às vezes mata Promise depois do response).
    // Idempotência por evolution_message_id (acima) já protege contra dups
    // de retry caso aconteça timeout em algum cenário extremo.
    console.log("[webhook evolution] processando agente lead=" + lead.id);
    const decision = await runAgent(ctx);
    console.log(
      "[webhook evolution] agente decidiu " +
        decision.toolCalls.length +
        " tool calls: " +
        decision.toolCalls.map((c) => c.name).join(","),
    );
    const exec = await executeAgentTools({
      campaignLeadId: lead.id,
      toolCalls: decision.toolCalls,
      reasoning: decision.reasoning,
    });
    console.log(
      "[webhook evolution] executor: " +
        exec.executed.map((e) => e.tool + "=" + e.result).join(","),
    );

    return NextResponse.json({
      ok: true,
      tool_calls: decision.toolCalls.map((c) => c.name),
      executed: exec.executed,
    });
  } catch (e: any) {
    console.error("[webhook evolution] erro", e?.message, e?.stack);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "erro" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "webhook evolution" });
}
