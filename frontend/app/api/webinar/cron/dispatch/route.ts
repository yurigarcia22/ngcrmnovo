/**
 * Cron de dispatch — envia mensagens pending que já venceram.
 *
 * Diferenciação por categoria:
 *   - initial_outreach: jitter de 3 a 7 minutos entre cada lead (anti-ban).
 *   - reminder/nutricao/post_event: dispara em rajada respeitando scheduled_at.
 *   - agent_reply: timer humano curto (5-30s).
 *
 * Configurar como Vercel Cron: GET /api/webinar/cron/dispatch
 * Schedule sugerido: a cada 1-2 minutos.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { pickInstance, sendTextViaEvolution } from "@/lib/webinar/evolution";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 30;

// Jitter por categoria (segundos)
const JITTER_BY_CATEGORY: Record<string, { min: number; max: number }> = {
  initial_outreach: { min: 180, max: 420 }, // 3 a 7 min
  reminder: { min: 5, max: 20 }, // 5 a 20s
  nutricao: { min: 5, max: 20 },
  post_event: { min: 5, max: 20 },
  agent_reply: { min: 5, max: 30 },
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(_req: NextRequest) {
  return runDispatch();
}
export async function POST(_req: NextRequest) {
  return runDispatch();
}

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

    const results: Array<{
      id: string;
      ok: boolean;
      instance?: string;
      category?: string;
      delay_ms?: number;
      error?: string;
    }> = [];

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

      const instance = await pickInstance({
        instance_names: campaign.instance_names,
        instance_name: campaign.instance_name,
      });
      if (!instance) {
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

      const evoRes = await sendTextViaEvolution(
        instance,
        lead.phone,
        row.sent_text ?? "",
      );

      if (!evoRes.ok) {
        await supabase
          .from("webinar_messages")
          .update({
            status: "failed",
            error_message: evoRes.error?.slice(0, 500),
            instance_used: instance,
          })
          .eq("id", row.id);
        results.push({
          id: row.id,
          ok: false,
          instance,
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
          instance_used: instance,
        })
        .eq("id", row.id);

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

      // Jitter humano DEPOIS do envio antes do próximo lead da mesma rodada
      const jitter = JITTER_BY_CATEGORY[category] ?? JITTER_BY_CATEGORY.reminder;
      const delaySec = randInt(jitter.min, jitter.max);
      results.push({
        id: row.id,
        ok: true,
        instance,
        category,
        delay_ms: delaySec * 1000,
      });

      // Aguarda jitter antes da próxima mensagem (anti-ban)
      // Só faz delay se ainda há mais mensagens pra processar
      const remaining = (rows ?? []).indexOf(row) < (rows?.length ?? 0) - 1;
      if (remaining) {
        await sleep(delaySec * 1000);
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
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
