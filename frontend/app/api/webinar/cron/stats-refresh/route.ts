/**
 * Cron de refresh de stats por instância.
 *
 * Roda refresh_webinar_instance_stats_all() no Postgres, que reagrega
 * a tabela webinar_instance_stats_snapshot pra todas campanhas
 * active/paused/ready/finished.
 *
 * Cron sugerido: a cada 5 minutos.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  return runRefresh();
}
export async function POST(_req: NextRequest) {
  return runRefresh();
}

async function runRefresh() {
  const startedAt = Date.now();
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc(
      "refresh_webinar_instance_stats_all",
    );
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      rows_generated: data ?? 0,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error("[cron stats-refresh] erro", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "erro" },
      { status: 500 },
    );
  }
}
