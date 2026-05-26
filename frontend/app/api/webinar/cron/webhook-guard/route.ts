/**
 * Webhook Guard — proteção contra reset externo de webhook das instâncias.
 *
 * Problema observado: algo (provavelmente workflow do N8N velho) reaplica
 * o webhook do INSTA-AUTOMATIC pra apontar pra n8n.grupong.online a cada
 * X minutos. Quando isso acontece, mensagens inbound vão pro N8N e são
 * descartadas (ou processadas pelo lugar errado), travando o agente.
 *
 * Solução: cron de 1 minuto que checa rapidamente o webhook de cada
 * instância "open" no Evolution e reaplica se a URL diverge da env
 * N8N_WEBINAR_WEBHOOK_URL. Sem dependência do health-check completo
 * (que roda a cada 5 min e faz muito mais coisa).
 *
 * Idempotente: se webhook já está correto, só retorna OK sem chamar
 * setWebhook (não gera logs falsos).
 */

import { NextRequest, NextResponse } from "next/server";
import { listEvolutionInstances, setEvolutionWebhook } from "@/lib/webinar/evolution";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CRM_WEBHOOK_URL = process.env.N8N_WEBINAR_WEBHOOK_URL ?? "";

/**
 * Lista instance_names registradas em public.whatsapp_instances.
 * Essas pertencem ao CRM principal — webhook delas aponta para a
 * Edge Function `webhook-evolution`, NAO para o webinar. O guard
 * NUNCA deve sobrescrever elas (essa era a causa raiz das mensagens
 * do CRM nao chegarem em /leads e /chat).
 */
async function getCrmManagedInstances(): Promise<Set<string>> {
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await admin
      .from("whatsapp_instances")
      .select("instance_name");
    return new Set((data ?? []).map((r: any) => r.instance_name));
  } catch {
    return new Set();
  }
}

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

async function run() {
  const startedAt = Date.now();

  if (!CRM_WEBHOOK_URL) {
    return NextResponse.json(
      {
        ok: false,
        error: "N8N_WEBINAR_WEBHOOK_URL não configurado",
      },
      { status: 500 },
    );
  }

  let instances: Awaited<ReturnType<typeof listEvolutionInstances>> = [];
  try {
    instances = await listEvolutionInstances();
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: `Evolution unreachable: ${e?.message ?? "?"}`,
      },
      { status: 500 },
    );
  }

  const results: Result[] = [];
  const crmManaged = await getCrmManagedInstances();

  for (const inst of instances) {
    // PROTECAO: instancias do CRM principal (registradas em
    // whatsapp_instances) tem webhook proprio apontando para a Edge
    // Function. Nunca sobrescrever — ja deu vazamento antes.
    if (crmManaged.has(inst.name)) {
      results.push({
        instance_name: inst.name,
        status: "skipped",
        error: "crm_managed",
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

      if (currentUrl === CRM_WEBHOOK_URL && enabled) {
        results.push({
          instance_name: inst.name,
          status: "ok",
          was_url: currentUrl,
        });
        continue;
      }

      // Diverge: reaplica
      const fix = await setEvolutionWebhook(inst.name, CRM_WEBHOOK_URL);
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
    error_count: results.filter((r) => r.status === "error").length,
    duration_ms: Date.now() - startedAt,
    results,
  });
}
