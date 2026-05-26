/**
 * Webhook Guard — Versao tenant-aware (Fase B).
 *
 * Antes: listava TODAS as instancias da Evolution e forcava o webhook
 * delas para N8N_WEBINAR_WEBHOOK_URL. Isso sobrescrevia o webhook das
 * instancias do CRM principal e causava mensagens perdidas.
 *
 * Agora: itera apenas em instancias registradas em
 * public.whatsapp_instances com purpose ∈ ('webinar', 'both') e que
 * estao em estado "open" na Evolution. Instancias purpose='crm' tem
 * webhook proprio apontando para a Edge Function do Supabase e NUNCA
 * sao tocadas pelo guard.
 *
 * Idempotente: se webhook ja esta correto, nao chama setWebhook.
 *
 * KILL SWITCH: se WEBHOOK_GUARD_ENABLED = "false" em env, aborta
 * imediatamente sem fazer nada. Util para pausar emergencialmente.
 */

import { NextRequest, NextResponse } from "next/server";
import { listEvolutionInstances, setEvolutionWebhook } from "@/lib/webinar/evolution";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const WEBINAR_WEBHOOK_URL = process.env.N8N_WEBINAR_WEBHOOK_URL ?? "";
const GUARD_ENABLED = (process.env.WEBHOOK_GUARD_ENABLED ?? "true") !== "false";

export async function GET(_req: NextRequest) {
  return run();
}
export async function POST(_req: NextRequest) {
  return run();
}

type Result = {
  instance_name: string;
  status: "ok" | "fixed" | "error" | "skipped";
  was_url?: string | null;
  error?: string;
};

interface ManagedInstance {
  instance_name: string;
  purpose: "crm" | "webinar" | "both";
  tenant_id: string;
}

/**
 * Lista todas as instancias gerenciadas pelo CRM (registradas em
 * whatsapp_instances) com suas purposes.
 */
async function getManagedInstances(): Promise<ManagedInstance[]> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await admin
    .from("whatsapp_instances")
    .select("instance_name, purpose, tenant_id");
  return (data ?? []) as ManagedInstance[];
}

async function run() {
  const startedAt = Date.now();

  if (!GUARD_ENABLED) {
    return NextResponse.json(
      { ok: true, skipped_all: true, reason: "WEBHOOK_GUARD_ENABLED=false" },
      { status: 200 },
    );
  }

  if (!WEBINAR_WEBHOOK_URL) {
    return NextResponse.json(
      { ok: false, error: "N8N_WEBINAR_WEBHOOK_URL não configurado" },
      { status: 500 },
    );
  }

  const managed = await getManagedInstances();

  // Set de nomes que pertencem ao CRM principal (purpose='crm').
  // Essas NUNCA sao tocadas pelo guard.
  const crmOnly = new Set(
    managed.filter((m) => m.purpose === "crm").map((m) => m.instance_name),
  );

  // Nomes que o guard deve manter apontando pro webhook do webinar.
  // (purpose='webinar' ou 'both')
  const webinarTargets = new Set(
    managed
      .filter((m) => m.purpose === "webinar" || m.purpose === "both")
      .map((m) => m.instance_name),
  );

  let instances: Awaited<ReturnType<typeof listEvolutionInstances>> = [];
  try {
    instances = await listEvolutionInstances();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: `Evolution unreachable: ${e?.message ?? "?"}` },
      { status: 500 },
    );
  }

  const results: Result[] = [];

  for (const inst of instances) {
    // 1) CRM-only: NUNCA tocar (defesa em profundidade)
    if (crmOnly.has(inst.name)) {
      results.push({
        instance_name: inst.name,
        status: "skipped",
        error: "crm_managed",
      });
      continue;
    }

    // 2) Nao gerenciada (nao registrada em whatsapp_instances): pular.
    //    Antes pegava qualquer instancia externa — agora ignoramos
    //    pra forcar que TODA instancia tenha dona conhecida no CRM.
    if (!webinarTargets.has(inst.name)) {
      results.push({
        instance_name: inst.name,
        status: "skipped",
        error: "unmanaged_external",
      });
      continue;
    }

    if (inst.connectionStatus !== "open") {
      results.push({
        instance_name: inst.name,
        status: "skipped",
        error: `connection_status=${inst.connectionStatus}`,
      });
      continue;
    }

    try {
      const r = await fetch(
        `${process.env.EVOLUTION_API_URL}/webhook/find/${encodeURIComponent(inst.name)}`,
        { headers: { apikey: process.env.EVOLUTION_API_TOKEN ?? "" } },
      );

      let currentUrl: string | null = null;
      let enabled = false;
      if (r.ok) {
        const wh = await r.json();
        currentUrl = wh?.url ?? null;
        enabled = !!wh?.enabled;
      }

      if (currentUrl === WEBINAR_WEBHOOK_URL && enabled) {
        results.push({
          instance_name: inst.name,
          status: "ok",
          was_url: currentUrl,
        });
        continue;
      }

      const fix = await setEvolutionWebhook(inst.name, WEBINAR_WEBHOOK_URL);
      if (fix.ok) {
        results.push({
          instance_name: inst.name,
          status: "fixed",
          was_url: currentUrl,
        });
      } else {
        results.push({
          instance_name: inst.name,
          status: "error",
          was_url: currentUrl,
          error: fix.error,
        });
      }
    } catch (e: any) {
      results.push({
        instance_name: inst.name,
        status: "error",
        error: e?.message ?? "?",
      });
    }
  }

  return NextResponse.json({
    ok: results.every((r) => r.status !== "error"),
    fixed_count: results.filter((r) => r.status === "fixed").length,
    ok_count: results.filter((r) => r.status === "ok").length,
    skipped_count: results.filter((r) => r.status === "skipped").length,
    error_count: results.filter((r) => r.status === "error").length,
    duration_ms: Date.now() - startedAt,
    results,
  });
}
