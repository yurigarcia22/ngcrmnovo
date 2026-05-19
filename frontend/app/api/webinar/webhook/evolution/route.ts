/**
 * Webhook Evolution — recebe eventos do WhatsApp.
 *
 * Fluxo:
 *   1. Valida evento, extrai JID/phone
 *   2. Checa idempotência, busca lead, salva inbound
 *   3. Retorna 200 imediatamente (< 200ms) — Evolution não timeout
 *   4. Roda agente OpenAI em background (Node.js event loop mantém vivo)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { runAgent, runAgentForceMessage } from "@/lib/webinar/openai-agent";
import { executeAgentTools, looksLikeAutoReply, isInActiveLoop } from "@/lib/webinar/agent-executor";
import type { AgentContext } from "@/lib/webinar/agent-prompt";
import { pickInstance, sendTextHuman, markMessageAsRead } from "@/lib/webinar/evolution";

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

const ERROR_FALLBACK_MESSAGE =
  "Tô com uma instabilidade aqui, me dá um minuto que eu volto.";

/**
 * Emergency fallback: SILENCIOSO por padrão.
 *
 * Antes: enviava "Tô com uma instabilidade..." pro lead, que poluía o
 * histórico e confundia o LLM nas próximas chamadas (ele via a frase
 * fora de contexto e dava follow-ups esquisitos).
 *
 * Agora: só LOGA o erro. O proximo inbound do lead vai disparar nova
 * tentativa do agente — sem mensagem visivel pro lead.
 *
 * Mantemos a funcao pra compatibilidade e possivel override futuro.
 */
async function sendEmergencyFallback(
  campaignLeadId: string,
  text: string,
): Promise<void> {
  // Silencioso: apenas loga, nao envia nada pro lead.
  console.warn(
    "[webhook evolution] emergency_fallback SUPRIMIDO lead=" + campaignLeadId +
    " (texto era: '" + text.slice(0, 60) + "...')",
  );
  return;
  // Codigo antigo abaixo intencionalmente NAO removido — caso queira
  // reativar pra debug.
  // eslint-disable-next-line no-unreachable
  await _sendFallbackImpl(campaignLeadId, text);
}

async function _sendFallbackImpl(
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
    const evoRes = await sendTextHuman(picked.name, lead.phone, text);
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

/**
 * Wrapper que adiciona DEBOUNCE + LOCK ao agente background.
 *
 * Debounce 8s: espera caso mais inbounds estejam chegando rapido.
 * Lock atomico: so UM processo roda o agente por lead. Outros saem skipped.
 *
 * O processo que ganha o lock vai ler TODO o historico (incluindo os
 * inbounds que chegaram durante o debounce) e responder com contexto
 * completo, 1 vez so.
 */
async function runAgentWithLockAndDebounce(
  campaignLeadId: string,
  ctx: AgentContext,
  inboundId: string | null,
) {
  const supabase = createServiceClient();

  // 1. Debounce: espera 8s pra coalescer inbounds proximos
  await new Promise((r) => setTimeout(r, 8000));

  // 2. Tenta adquirir lock atomico
  const { data: tokenData } = await supabase.rpc("webinar_acquire_agent_lock", {
    p_lead_id: campaignLeadId,
  });
  const lockToken: string | null = tokenData ?? null;

  if (!lockToken) {
    console.log(
      "[webhook evolution] [bg] lock_held_by_another lead=" + campaignLeadId +
      " — outro processo ja esta processando, skip",
    );
    if (inboundId) {
      await supabase
        .from("webinar_messages")
        .update({
          agent_processed_at: new Date().toISOString(),
          ai_metadata: { type: "skipped_lock_held_by_another" },
        })
        .eq("id", inboundId);
    }
    return;
  }

  // 3. Reload do contexto APOS o debounce — historico pode ter crescido
  //    com inbounds que chegaram nos ultimos 8s.
  try {
    const { data: history } = await supabase
      .from("webinar_messages")
      .select("direction, sent_text, created_at, status")
      .eq("campaign_lead_id", campaignLeadId)
      .neq("status", "pending")
      .order("created_at", { ascending: true });

    const enrichedCtx: AgentContext = {
      ...ctx,
      conversationHistory: (history ?? []).slice(-30).map((h: any) => ({
        direction: h.direction,
        content: h.sent_text ?? "",
        createdAt: h.created_at,
      })),
    };

    console.log(
      "[webhook evolution] [bg] lock adquirido lead=" + campaignLeadId +
      " token=" + lockToken.slice(0, 8) +
      " historico=" + (history?.length ?? 0),
    );

    await runAgentBackground(campaignLeadId, enrichedCtx, inboundId);
  } finally {
    // 4. SEMPRE libera o lock no final
    await supabase.rpc("webinar_release_agent_lock", {
      p_lead_id: campaignLeadId,
      p_token: lockToken,
    });
    console.log(
      "[webhook evolution] [bg] lock liberado lead=" + campaignLeadId,
    );
  }
}

async function runAgentBackground(campaignLeadId: string, ctx: AgentContext, inboundId: string | null) {
  const supabase = createServiceClient();
  let decisionMade = false;
  const markDone = async () => {
    if (inboundId) {
      await supabase
        .from("webinar_messages")
        .update({ agent_processed_at: new Date().toISOString() })
        .eq("id", inboundId);
    }
  };

  const forceMessageAndSend = async (baseReasoning?: string): Promise<boolean> => {
    try {
      const retryDecision = await Promise.race([
        runAgentForceMessage(ctx),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("openai_force_timeout_25s")), 25_000),
        ),
      ]);
      console.log("[webhook evolution] [bg] force send_message: " + retryDecision.toolCalls.length + " tool calls");
      if (retryDecision.toolCalls.length > 0) {
        const exec2 = await executeAgentTools({
          campaignLeadId,
          toolCalls: retryDecision.toolCalls,
          reasoning: (baseReasoning ?? "") + " | force: " + (retryDecision.reasoning ?? ""),
        });
        return exec2.executed.some((e) => e.tool === "send_message" && e.result === "ok");
      }
    } catch (err: any) {
      console.error("[webhook evolution] [bg] force send_message erro:", err?.message);
    }
    return false;
  };

  try {
    console.log("[webhook evolution] [bg] iniciando agente lead=" + campaignLeadId);

    const decision = await Promise.race([
      runAgent(ctx),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("openai_timeout_25s")), 25_000),
      ),
    ]);

    decisionMade = true;
    console.log(
      "[webhook evolution] [bg] agente decidiu " +
        decision.toolCalls.length +
        " tool calls: " +
        decision.toolCalls.map((c) => c.name).join(","),
    );

    const hasSendMessage = decision.toolCalls.some((c) => c.name === "send_message");

    if (decision.toolCalls.length === 0 || !hasSendMessage) {
      // Agente não incluiu send_message — executa outras tools se houver, depois força resposta real
      let alreadySentByExecutor = false;
      if (decision.toolCalls.length > 0) {
        const otherCalls = decision.toolCalls.filter((c) => c.name !== "send_message");
        if (otherCalls.length > 0) {
          const execOther = await executeAgentTools({ campaignLeadId, toolCalls: otherCalls, reasoning: decision.reasoning });
          // _auto_confirmation dispara quando collect_responsible_info é chamado sem send_message
          alreadySentByExecutor = execOther.executed.some(
            (e) => e.tool === "_auto_confirmation" && e.result === "ok",
          );
        }
      }
      if (!alreadySentByExecutor) {
        console.warn("[webhook evolution] [bg] sem send_message na decisao — forcando resposta real via OpenAI");
        const sent = await forceMessageAndSend(decision.reasoning);
        if (!sent) {
          console.warn("[webhook evolution] [bg] force tambem falhou — emergency fallback");
          await sendEmergencyFallback(campaignLeadId, ERROR_FALLBACK_MESSAGE);
        }
      }
    } else {
      const exec = await executeAgentTools({
        campaignLeadId,
        toolCalls: decision.toolCalls,
        reasoning: decision.reasoning,
      });
      console.log(
        "[webhook evolution] [bg] executor: " +
          exec.executed.map((e) => e.tool + "=" + e.result).join(","),
      );

      const sentOk = exec.executed.some(
        (e) => (e.tool === "send_message" || e.tool === "_auto_confirmation") && e.result === "ok",
      );
      if (!sentOk) {
        console.warn("[webhook evolution] [bg] send_message nao confirmado — forcando resposta real via OpenAI");
        const sent = await forceMessageAndSend(decision.reasoning);
        if (!sent) {
          console.warn("[webhook evolution] [bg] force tambem falhou — emergency fallback");
          await sendEmergencyFallback(campaignLeadId, ERROR_FALLBACK_MESSAGE);
        }
      }
    }

    await supabase
      .from("webinar_campaign_leads")
      .update({ last_interaction_at: new Date().toISOString() })
      .eq("id", campaignLeadId);
    await markDone();
  } catch (e: any) {
    console.error("[webhook evolution] [bg] erro no agente:", e?.message, e?.stack);
    // Catch-all final: erro real de API/rede — avisa o lead sobre instabilidade
    if (!decisionMade) {
      await sendEmergencyFallback(campaignLeadId, ERROR_FALLBACK_MESSAGE);
    }
    await markDone();
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

    // Idempotência ATÔMICA via constraint do Postgres.
    // O lock natural acontece no INSERT mais embaixo (com .upsert + onConflict)
    // — duas requests com mesmo messageId nao conseguem ambas inserir.
    // Aqui só verifica se já houve processamento finalizado.
    let alreadyProcessed = false;
    let alreadyProcessing = false;
    let existingInboundId: string | null = null;
    if (messageId) {
      const { data: dup } = await supabase
        .from("webinar_messages")
        .select("id, campaign_lead_id, created_at, agent_processed_at, agent_processing_started_at")
        .eq("evolution_message_id", messageId)
        .eq("direction", "inbound")
        .limit(1);
      if (dup && dup.length > 0) {
        const row = dup[0] as any;
        existingInboundId = row.id;
        if (row.agent_processed_at) {
          alreadyProcessed = true;
        } else if (row.agent_processing_started_at) {
          // Em processamento? (criado < 60s atras = ainda rodando agente)
          const ageMs = Date.now() - new Date(row.agent_processing_started_at).getTime();
          if (ageMs < 60_000) {
            alreadyProcessing = true;
          }
        }
      }
    }
    if (alreadyProcessed) {
      console.log("[webhook evolution] ignorando: msgId=" + messageId + " ja processado");
      return NextResponse.json({ ok: true, ignored: "already_processed" });
    }
    if (alreadyProcessing) {
      console.log("[webhook evolution] ignorando: msgId=" + messageId + " em processamento (agente rodando)");
      return NextResponse.json({ ok: true, ignored: "in_processing" });
    }
    if (existingInboundId) {
      console.log("[webhook evolution] msgId=" + messageId + " orfao (>60s sem termino) — reprocessando");
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

    // Insert atomic com unique constraint em (evolution_message_id) para inbound.
    // Se 2 webhooks chegam com mesmo messageId simultaneamente, só um insere.
    // O outro recebe erro 23505 e a gente trata como "in_processing".
    const inboundId = existingInboundId ?? (await (async () => {
      const nowIso = new Date().toISOString();
      const { data: ins, error } = await supabase
        .from("webinar_messages")
        .insert({
          campaign_lead_id: lead.id,
          scheduled_at: nowIso,
          status: "replied",
          direction: "inbound",
          sent_text: effectiveText,
          sent_at: nowIso,
          evolution_message_id: messageId ?? null,
          instance_used: instanceName ?? null,
          agent_processing_started_at: nowIso,
        })
        .select("id")
        .single();
      if (error) {
        // 23505 = unique violation = outro processo inseriu primeiro
        if (error.code === "23505") {
          console.log("[webhook evolution] race detectada msgId=" + messageId + " — outro processo ganhou");
          return null;
        }
        throw error;
      }
      return ins?.id ?? null;
    })());

    if (!inboundId) {
      // Outro processo ja esta cuidando. Ignora.
      return NextResponse.json({ ok: true, ignored: "race_lost" });
    }

    // Se reprocessamento de orfao, marca processing_started_at agora
    if (existingInboundId) {
      await supabase
        .from("webinar_messages")
        .update({ agent_processing_started_at: new Date().toISOString() })
        .eq("id", existingInboundId);
    }

    // ── Fire-and-forget: marca mensagem como lida após delay humano ──────
    // Bot que processa msg sem nunca marcar como lida é fingerprint clássico.
    // Delay 5-30s aleatório simula tempo de a pessoa abrir/ler o WhatsApp.
    if (messageId && instanceName && effectiveJid) {
      const readDelayMs = 5000 + Math.random() * 25000;
      setTimeout(() => {
        markMessageAsRead(instanceName, effectiveJid, messageId)
          .then((r) => {
            if (!r.ok) {
              console.warn(
                "[webhook evolution] markAsRead falhou (best-effort): " + r.error,
              );
            }
          })
          .catch((err) => {
            console.warn(
              "[webhook evolution] markAsRead exception: " + (err?.message ?? "?"),
            );
          });
      }, readDelayMs);
    }

    // Atualiza status se necessário
    const cur = lead.funnel_status;
    if (cur === "invited" || cur === "viewed" || cur === "scraped" || cur === "enriched") {
      await supabase
        .from("webinar_campaign_leads")
        .update({ funnel_status: "replied" })
        .eq("id", lead.id);
    }

    // Carrega histórico — IMPORTANTE: filtra pending (cadência futura agendada).
    // Sem esse filtro, o agente ve mensagens de lembretes futuros como se ja
    // tivessem sido enviadas e fica completamente confuso (alucinando, mandando
    // duplicatas, ou silenciando).
    const { data: history } = await supabase
      .from("webinar_messages")
      .select("direction, sent_text, created_at, status")
      .eq("campaign_lead_id", lead.id)
      .neq("status", "pending")
      .order("created_at", { ascending: true });

    const campaign = lead.webinar_campaigns;
    const eventDate = campaign.event_date ? new Date(campaign.event_date) : null;

    const ctx: AgentContext = {
      campaignName: campaign.name,
      theme: campaign.theme,
      description: campaign.description ?? null,
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
      conversationHistory: (history ?? []).slice(-30).map((h: any) => ({
        direction: h.direction,
        content: h.sent_text ?? "",
        createdAt: h.created_at,
      })),
    };

    console.log(
      "[webhook evolution] historico carregado: " + (history?.length ?? 0) +
      " msgs (sem pending), usando ultimas " + Math.min(30, history?.length ?? 0),
    );

    // IA pausada manualmente pelo operador — ignora agente
    if (lead.ai_paused) {
      console.log("[webhook evolution] lead=" + lead.id + " ai_paused=true — agente ignorado");
      return NextResponse.json({ ok: true, skipped: "ai_paused", leadId: lead.id });
    }

    // Auto-reply do WhatsApp Business detectado — não chamar agente.
    // Marca como processado pra não ficar reprocessando.
    if (looksLikeAutoReply(effectiveText)) {
      console.log("[webhook evolution] lead=" + lead.id + " text parece auto-reply de WhatsApp Business — ignorando agente");
      await supabase
        .from("webinar_messages")
        .update({
          agent_processed_at: new Date().toISOString(),
          ai_metadata: { type: "auto_reply_detected_skipped" },
        })
        .eq("id", inboundId);
      return NextResponse.json({ ok: true, skipped: "auto_reply_detected", leadId: lead.id });
    }

    // Detecção de loop ativo — defesa em profundidade.
    // Se o agente já mandou >=3 outbound nos últimos 5min SEM inbound humano real,
    // está em loop. Pausa o lead automaticamente pra interromper o sangramento.
    const loopCheck = await isInActiveLoop(lead.id);
    if (loopCheck.inLoop) {
      console.warn(
        "[webhook evolution] lead=" + lead.id + " LOOP DETECTADO (" + loopCheck.reason + ") — auto-pausando",
      );
      await supabase
        .from("webinar_campaign_leads")
        .update({
          ai_paused: true,
          loss_reason: "loop_auto_paused: " + loopCheck.reason,
        })
        .eq("id", lead.id);
      await supabase
        .from("webinar_messages")
        .update({
          agent_processed_at: new Date().toISOString(),
          ai_metadata: { type: "loop_detected_auto_pause", reason: loopCheck.reason },
        })
        .eq("id", inboundId);
      return NextResponse.json({
        ok: true,
        skipped: "loop_detected_auto_pause",
        leadId: lead.id,
        reason: loopCheck.reason,
      });
    }

    console.log("[webhook evolution] lead=" + lead.id + " status=" + cur + " msgs=" + (history?.length ?? 0) + " — agente em background");

    // ── LOCK + DEBOUNCE ────────────────────────────────────────────────────
    // Problema: lead manda 3 inbounds em sequência rápida ("ok" + "telefone"
    // + "email"). Cada um dispara o webhook em paralelo. 3 agentes rodam ao
    // mesmo tempo, todos leem o mesmo histórico, todos decidem mandar a
    // mesma frase → 3-4 mensagens duplicadas em segundos.
    //
    // Solução:
    // 1. Debounce 8s: espera caso mais inbounds estejam chegando
    // 2. Lock atômico: só UM agente roda por lead. Outros saem skipped.
    // 3. O agente que tem o lock vai ver TODAS as inbounds no histórico
    //    e responde 1x só com contexto completo.
    void runAgentWithLockAndDebounce(lead.id, ctx, inboundId);

    return NextResponse.json({ ok: true, agent: "background", leadId: lead.id });
  } catch (e: any) {
    console.error("[webhook evolution] erro", e?.message, e?.stack);
    return NextResponse.json({ ok: false, error: e?.message ?? "erro" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "webhook evolution" });
}
