/**
 * Cron de dispatch — envia mensagens pending que já venceram.
 *
 * MODELO POR-INSTÂNCIA (refatorado em 2026-04-30):
 *   - initial_outreach: cap diário 101/chip + jitter 4-9min POR instância +
 *     quiet hours 9h-20h America/Sao_Paulo. Volume escala linear com nº de chips.
 *     Ex: 3 chips = ~300/dia, 5 chips = ~500/dia.
 *   - reminder/nutricao/post_event: dispara respeitando scheduled_at, sem cap.
 *   - agent_reply: timer humano curto (5-30s), sem cap.
 *
 * Como funciona:
 *   1. Busca leads pending vencidos (até BATCH_SIZE)
 *   2. Para cada lead: pickInstanceCandidates → tenta claim atômico em cada
 *      instância da lista até achar uma disponível (cooldown ok, cap ok, active)
 *   3. Se nenhuma claim: skip (próximo run pega)
 *   4. Sem await sleep no loop = volume real cresce com nº de chips
 *
 * Cron sugerido: a cada 30-60s. Roda fast (sem sleeps), termina em segundos.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import {
  pickInstanceCandidates,
  sendTextViaEvolution,
} from "@/lib/webinar/evolution";
import {
  claimInstance,
  releaseInstanceOnFailure,
  isWithinQuietHours,
  isRateLimited,
} from "@/lib/webinar/dispatch-policy";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 60;

export async function GET(_req: NextRequest) {
  return runDispatch();
}
export async function POST(_req: NextRequest) {
  return runDispatch();
}

type DispatchResult = {
  id: string;
  ok: boolean;
  instance?: string;
  category?: string;
  skipped_reason?: string;
  error?: string;
};

async function runDispatch() {
  const supabase = createServiceClient();
  const startedAt = new Date();

  try {
    const { data: rows, error } = await supabase
      .from("webinar_messages")
      .select(
        `
        id,
        campaign_lead_id,
        sent_text,
        scheduled_at,
        category,
        ai_metadata,
        webinar_campaign_leads!inner (
          id,
          phone,
          funnel_status,
          campaign_id,
          last_instance_used,
          webinar_campaigns!inner (
            id,
            instance_name,
            instance_names,
            status
          )
        )
        `,
      )
      .eq("status", "pending")
      .eq("direction", "outbound")
      .lte("scheduled_at", startedAt.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;

    const results: DispatchResult[] = [];
    const withinQuietHours = isWithinQuietHours(startedAt);

    for (const row of rows ?? []) {
      const lead = (row as any).webinar_campaign_leads;
      const campaign = lead?.webinar_campaigns;
      const category: string = (row as any).category ?? "initial_outreach";

      if (!campaign || campaign.status !== "active") {
        await supabase
          .from("webinar_messages")
          .update({
            status: "cancelled",
            error_message: "campanha não ativa",
          })
          .eq("id", row.id);
        results.push({
          id: row.id,
          ok: false,
          error: "campanha não ativa",
          category,
        });
        continue;
      }

      // Quiet hours: só bloqueia categorias rate-limited (initial_outreach).
      // agent_reply e cadências passam direto (são respostas em tempo real).
      if (isRateLimited(category) && !withinQuietHours) {
        results.push({
          id: row.id,
          ok: false,
          category,
          skipped_reason: "outside_quiet_hours",
        });
        continue;
      }

      const candidateList = await pickInstanceCandidates({
        instance_names: campaign.instance_names,
        instance_name: campaign.instance_name,
        preferredInstance: lead.last_instance_used ?? null,
      });
      if (!candidateList || candidateList.candidates.length === 0) {
        await supabase
          .from("webinar_messages")
          .update({
            status: "failed",
            error_message: "nenhuma instance disponível",
          })
          .eq("id", row.id);
        results.push({
          id: row.id,
          ok: false,
          error: "sem instance",
          category,
        });
        continue;
      }

      // Tenta claim atômico em cada candidata até achar uma disponível.
      // Para categorias rate-limited respeita cap+cooldown.
      // Para outras (agent_reply, reminder de cadência ativa, etc) usa a primeira open
      // sem passar pelo claim (resposta em tempo real não pode esperar cooldown).
      let chosen: string | null = null;
      let isFailover = false;

      if (isRateLimited(category)) {
        for (const candidate of candidateList.candidates) {
          const claim = await claimInstance(supabase, candidate);
          if (claim.granted) {
            chosen = candidate;
            isFailover =
              candidateList.preferredInstance !== null &&
              candidateList.preferredInstance !== candidate;
            break;
          }
        }
        if (!chosen) {
          // Todas as instâncias em cooldown ou cap atingido. Lead fica pending.
          results.push({
            id: row.id,
            ok: false,
            category,
            skipped_reason: "all_instances_unavailable",
          });
          continue;
        }
      } else {
        chosen = candidateList.candidates[0];
        isFailover =
          candidateList.preferredInstance !== null &&
          candidateList.preferredInstance !== chosen;
      }

      // Failover bridge (apenas pra agent_reply, não pra reminders/cron massivo)
      if (
        isFailover &&
        candidateList.preferredInstance &&
        category === "agent_reply"
      ) {
        const bridge =
          "Oi, voltei aqui (tive um problema no outro número). Continuando nossa conversa.";
        const bridgeRes = await sendTextViaEvolution(
          chosen,
          lead.phone,
          bridge,
        );
        if (bridgeRes.ok) {
          await supabase.from("webinar_messages").insert({
            campaign_lead_id: lead.id,
            scheduled_at: new Date().toISOString(),
            status: "sent",
            direction: "outbound",
            category: "agent_reply",
            sent_text: bridge,
            sent_at: new Date().toISOString(),
            ai_metadata: {
              type: "failover_bridge",
              from_instance: candidateList.preferredInstance,
              to_instance: chosen,
            },
            evolution_message_id: bridgeRes.messageId ?? null,
            instance_used: chosen,
          });
          await new Promise((r) => setTimeout(r, 3500));
        }
      }

      const evoRes = await sendTextViaEvolution(
        chosen,
        lead.phone,
        row.sent_text ?? "",
      );

      if (!evoRes.ok) {
        // Devolve o slot da instância pra retry rápido (decrementa contador
        // e libera cooldown em 30s)
        if (isRateLimited(category)) {
          await releaseInstanceOnFailure(supabase, chosen);
        }
        await supabase
          .from("webinar_messages")
          .update({
            status: "failed",
            error_message: evoRes.error?.slice(0, 500),
            instance_used: chosen,
          })
          .eq("id", row.id);
        results.push({
          id: row.id,
          ok: false,
          instance: chosen,
          category,
          error: evoRes.error,
        });
        continue;
      }

      await supabase
        .from("webinar_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          evolution_message_id: evoRes.messageId ?? null,
          instance_used: chosen,
        })
        .eq("id", row.id);

      // Atualiza lead affinity
      await supabase
        .from("webinar_campaign_leads")
        .update({ last_instance_used: chosen })
        .eq("id", lead.id);

      // Avança status do lead se for primeira saudação
      if (category === "initial_outreach") {
        if (
          lead.funnel_status === "scraped" ||
          lead.funnel_status === "enriched"
        ) {
          await supabase
            .from("webinar_campaign_leads")
            .update({ funnel_status: "pending_response" })
            .eq("id", lead.id);
        }
      }

      results.push({
        id: row.id,
        ok: true,
        instance: chosen,
        category,
      });
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok && !r.skipped_reason).length,
      skipped: results.filter((r) => !!r.skipped_reason).length,
      within_quiet_hours: withinQuietHours,
      results,
      duration_ms: Date.now() - startedAt.getTime(),
    });
  } catch (e: any) {
    console.error("[cron dispatch] erro", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "erro" },
      { status: 500 },
    );
  }
}
