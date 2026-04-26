/**
 * Cron de dispatch — envia mensagens da cadencia que estao pending e ja venceram.
 *
 * Configurar como Vercel Cron: vercel.json com schedule "* /5 * * * *" (a cada 5 min)
 * Ou chamar manualmente: GET /api/webinar/cron/dispatch
 *
 * Algoritmo:
 *   1. Busca webinar_messages WHERE status='pending' AND scheduled_at <= now() (limit 50)
 *   2. Pra cada: pickInstance + send + update status
 *   3. Atualiza lead.funnel_status conforme o caso
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  pickInstance,
  sendTextViaEvolution,
} from "@/lib/webinar/evolution";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 30;

export async function GET(req: NextRequest) {
  return runDispatch();
}

export async function POST(req: NextRequest) {
  return runDispatch();
}

async function runDispatch() {
  const supabase = await createClient();
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
      error?: string;
    }> = [];

    for (const row of rows ?? []) {
      const lead = (row as any).webinar_campaign_leads;
      const campaign = lead?.webinar_campaigns;

      if (!campaign || campaign.status !== "active") {
        await supabase
          .from("webinar_messages")
          .update({ status: "cancelled", error_message: "campaign not active" })
          .eq("id", row.id);
        results.push({ id: row.id, ok: false, error: "campaign not active" });
        continue;
      }

      const instance = await pickInstance({
        instance_names: campaign.instance_names,
        instance_name: campaign.instance_name,
      });
      if (!instance) {
        await supabase
          .from("webinar_messages")
          .update({ status: "failed", error_message: "no instance available" })
          .eq("id", row.id);
        results.push({ id: row.id, ok: false, error: "no instance" });
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
          error: evoRes.error,
        });
        continue;
      }

      // Sucesso
      await supabase
        .from("webinar_messages")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          evolution_message_id: evoRes.messageId ?? null,
          instance_used: instance,
        })
        .eq("id", row.id);

      // Avanca status do lead se ainda estiver scraped/enriched
      if (
        lead.funnel_status === "scraped" ||
        lead.funnel_status === "enriched"
      ) {
        await supabase
          .from("webinar_campaign_leads")
          .update({ funnel_status: "invited" })
          .eq("id", lead.id);

        await supabase.rpc("noop_or_increment_invited", {}).catch(() => {});
      }

      results.push({ id: row.id, ok: true, instance });

      // Pequena pausa entre mensagens pra nao floodar (anti-ban basico)
      await new Promise((r) => setTimeout(r, 1500));
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
