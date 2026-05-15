/**
 * Cron de quality-score — calcula taxa de resposta por chip nos últimos 7 dias.
 *
 * Roda 1x/dia (cron Easypanel sugerido: "0 4 * * *", 4h da manhã).
 *
 * Lógica:
 *   1. Pra cada instância ativa, conta mensagens outbound de `initial_outreach`
 *      enviadas nos últimos 7 dias com status=sent.
 *   2. Pra cada lead que recebeu uma dessas, verifica se teve inbound DEPOIS.
 *   3. Calcula reply_rate = leads_que_responderam / leads_que_receberam_outreach.
 *   4. Salva em webinar_instance_state.reply_rate_7d.
 *   5. Se reply_rate < 0.08 (8%): reduz daily_cap em 30% (mínimo 10).
 *
 * Sinal precoce de chip queimando: quando ninguém responde, é porque as
 * mensagens não estão chegando ou estão caindo em spam.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";

export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 7;
const REPLY_RATE_THRESHOLD = 0.08; // 8%
const CAP_REDUCTION_FACTOR = 0.7; // -30%
const MIN_CAP = 10;

type InstanceStat = {
  instance_name: string;
  sent_count: number;
  replied_count: number;
  reply_rate: number;
  previous_cap: number;
  new_cap: number;
  cap_reduced: boolean;
};

export async function GET(_req: NextRequest) {
  return runQualityScore();
}
export async function POST(_req: NextRequest) {
  return runQualityScore();
}

async function runQualityScore() {
  const supabase = createServiceClient();
  const startedAt = new Date();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);

  try {
    const { data: instances, error: instErr } = await supabase
      .from("webinar_instance_state")
      .select("instance_name, daily_cap, status");

    if (instErr) throw instErr;

    const stats: InstanceStat[] = [];

    for (const inst of instances ?? []) {
      if (inst.status !== "active") continue;

      // Conta leads únicos que receberam initial_outreach nos últimos 7 dias
      const { data: outreachRows } = await supabase
        .from("webinar_messages")
        .select("campaign_lead_id")
        .eq("instance_used", inst.instance_name)
        .eq("category", "initial_outreach")
        .eq("status", "sent")
        .eq("direction", "outbound")
        .gte("sent_at", since.toISOString());

      const leadIds = Array.from(
        new Set((outreachRows ?? []).map((r: any) => r.campaign_lead_id).filter(Boolean)),
      );

      const sentCount = leadIds.length;
      let repliedCount = 0;

      if (sentCount > 0) {
        // Conta quantos desses leads tiveram inbound DEPOIS da janela
        const { data: replies } = await supabase
          .from("webinar_messages")
          .select("campaign_lead_id")
          .in("campaign_lead_id", leadIds)
          .eq("direction", "inbound")
          .gte("created_at", since.toISOString());

        const repliedSet = new Set(
          (replies ?? []).map((r: any) => r.campaign_lead_id).filter(Boolean),
        );
        repliedCount = repliedSet.size;
      }

      const replyRate = sentCount > 0 ? repliedCount / sentCount : 0;
      const previousCap = inst.daily_cap;
      let newCap = previousCap;
      let capReduced = false;

      // Só reduz cap se tem amostra suficiente (>= 20 disparos) e taxa baixa
      if (sentCount >= 20 && replyRate < REPLY_RATE_THRESHOLD) {
        newCap = Math.max(
          MIN_CAP,
          Math.floor(previousCap * CAP_REDUCTION_FACTOR),
        );
        capReduced = newCap < previousCap;
      }

      // Atualiza state da instância
      const updates: Record<string, unknown> = { reply_rate_7d: replyRate };
      if (capReduced) updates.daily_cap = newCap;

      await supabase
        .from("webinar_instance_state")
        .update(updates)
        .eq("instance_name", inst.instance_name);

      stats.push({
        instance_name: inst.instance_name,
        sent_count: sentCount,
        replied_count: repliedCount,
        reply_rate: replyRate,
        previous_cap: previousCap,
        new_cap: newCap,
        cap_reduced: capReduced,
      });
    }

    return NextResponse.json({
      ok: true,
      computed_at: startedAt.toISOString(),
      lookback_days: LOOKBACK_DAYS,
      reply_rate_threshold: REPLY_RATE_THRESHOLD,
      instances_analyzed: stats.length,
      caps_reduced: stats.filter((s) => s.cap_reduced).length,
      stats,
      duration_ms: Date.now() - startedAt.getTime(),
    });
  } catch (e: any) {
    console.error("[cron quality-score] erro", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "erro" },
      { status: 500 },
    );
  }
}
