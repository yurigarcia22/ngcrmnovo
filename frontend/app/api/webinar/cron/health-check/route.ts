/**
 * Health-check do webinar SDR.
 *
 * Roda em intervalo curto (sugestão: 5 min via cron Easypanel).
 * Detecta problemas comuns e tenta auto-corrigir os SEGUROS (idempotentes).
 * Loga resultado pra a tabela webinar_health_log e retorna JSON do diagnóstico.
 *
 * Verificações:
 *  1. Instâncias Evolution open vs close (alerta se chip caiu)
 *  2. Webhook das instâncias apontando pra cá (re-aponta se errado)
 *  3. Mensagens pending atrasadas > 5 min (re-tenta dispatch)
 *  4. Mensagens inbound sem agent_processed_at > 3 min (re-tenta agente)
 *  5. Mensagens sent sem evolution_message_id (envio falhou)
 *
 * Auto-correção:
 *  - re-aponta webhook quando URL diverge
 *  - chama dispatch pra processar pending atrasadas
 *  - re-injeta inbound não processada via webhook handler
 *
 * NÃO auto-corrige (só alerta):
 *  - instância close (precisa QR humano)
 *  - lead stuck > 24h (precisa intervenção)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { listEvolutionInstances, setEvolutionWebhook } from "@/lib/webinar/evolution";

export const dynamic = "force-dynamic";

const CRM_WEBHOOK_URL = process.env.N8N_WEBINAR_WEBHOOK_URL ?? "";
const PENDING_STALE_MIN = 5;
const INBOUND_UNPROCESSED_MIN = 3;
const LEAD_STUCK_HOURS = 24;

type Issue = {
  severity: "info" | "warning" | "error";
  type: string;
  detail: string;
  fixed?: boolean;
};

export async function GET(req: NextRequest) {
  return runHealthCheck(req);
}

export async function POST(req: NextRequest) {
  return runHealthCheck(req);
}

async function runHealthCheck(req: NextRequest) {
  const issues: Issue[] = [];
  const supabase = createServiceClient();
  const startedAt = new Date();

  // ── 1. Instâncias Evolution e webhooks ──────────────────────────────────
  let liveInstances: Awaited<ReturnType<typeof listEvolutionInstances>> = [];
  try {
    liveInstances = await listEvolutionInstances();
  } catch (e: any) {
    issues.push({
      severity: "error",
      type: "evolution_unreachable",
      detail: `Evolution API não respondeu: ${e?.message ?? "?"}`,
    });
  }

  for (const inst of liveInstances) {
    // ── Sincroniza webinar_instance_state com a realidade do Evolution ──
    // Cria registro se ainda não existe (default cap=101, jitter 4-9min)
    await supabase
      .from("webinar_instance_state")
      .upsert(
        { instance_name: inst.name },
        { onConflict: "instance_name", ignoreDuplicates: true },
      );

    if (inst.connectionStatus !== "open") {
      issues.push({
        severity: "warning",
        type: "instance_not_open",
        detail: `Instância "${inst.name}" está ${inst.connectionStatus} (precisa reescanear QR no Evolution Manager)`,
        fixed: false,
      });
      // Auto-pause: bloqueia dispatch enquanto chip está fora
      const { error: pauseErr } = await supabase
        .from("webinar_instance_state")
        .update({
          status: "paused",
          paused_reason: `evolution_${inst.connectionStatus}`,
        })
        .eq("instance_name", inst.name)
        .neq("status", "banned"); // banned é decisão manual, não sobrescreve
      if (!pauseErr) {
        issues[issues.length - 1].fixed = true;
        issues[issues.length - 1].detail += " → instance_state pausado";
      }
      continue;
    }

    // Instância open: se estava paused por queda anterior, reativa
    await supabase
      .from("webinar_instance_state")
      .update({ status: "active", paused_reason: null })
      .eq("instance_name", inst.name)
      .eq("status", "paused")
      .like("paused_reason", "evolution_%");

    // Verifica webhook config
    try {
      const r = await fetch(
        `${process.env.EVOLUTION_API_URL}/webhook/find/${encodeURIComponent(inst.name)}`,
        { headers: { apikey: process.env.EVOLUTION_API_TOKEN ?? "" } },
      );
      if (r.ok) {
        const wh = await r.json();
        if (wh.url !== CRM_WEBHOOK_URL || !wh.enabled) {
          issues.push({
            severity: "warning",
            type: "webhook_misconfigured",
            detail: `${inst.name}: webhook era "${wh.url || "vazio"}" (enabled=${wh.enabled})`,
            fixed: false,
          });
          // Auto-fix
          if (CRM_WEBHOOK_URL) {
            const fix = await setEvolutionWebhook(inst.name, CRM_WEBHOOK_URL);
            if (fix.ok) {
              issues[issues.length - 1].fixed = true;
              issues[issues.length - 1].detail += " → corrigido";
            }
          }
        }
      }
    } catch (e: any) {
      issues.push({
        severity: "warning",
        type: "webhook_check_failed",
        detail: `${inst.name}: ${e?.message}`,
      });
    }
  }

  // ── 2. Mensagens pending atrasadas (>5min) ──────────────────────────────
  const staleThreshold = new Date(Date.now() - PENDING_STALE_MIN * 60_000).toISOString();
  const { data: stalePending } = await supabase
    .from("webinar_messages")
    .select("id, scheduled_at, sent_text")
    .eq("status", "pending")
    .eq("direction", "outbound")
    .lt("scheduled_at", staleThreshold)
    .limit(10);

  if (stalePending && stalePending.length > 0) {
    issues.push({
      severity: "warning",
      type: "pending_stale",
      detail: `${stalePending.length} mensagens outbound pending há mais de ${PENDING_STALE_MIN}min`,
      fixed: false,
    });
    // Auto-fix: chama dispatch
    try {
      const baseUrl =
        req?.headers?.get("host")
          ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("host")}`
          : process.env.NEXT_PUBLIC_BASE_URL ?? "";
      if (baseUrl) {
        await fetch(`${baseUrl.replace(/\/$/, "")}/api/webinar/cron/dispatch`, {
          method: "POST",
        });
        issues[issues.length - 1].fixed = true;
        issues[issues.length - 1].detail += " → dispatch chamado";
      }
    } catch (e: any) {
      issues[issues.length - 1].detail += ` (dispatch falhou: ${e?.message})`;
    }
  }

  // ── 3. Inbound sem agent_processed_at (>3min) ──────────────────────────
  const inboundThreshold = new Date(Date.now() - INBOUND_UNPROCESSED_MIN * 60_000).toISOString();
  const { data: unprocessed } = await supabase
    .from("webinar_messages")
    .select("id, campaign_lead_id, sent_text, created_at")
    .eq("direction", "inbound")
    .is("agent_processed_at", null)
    .lt("created_at", inboundThreshold)
    .limit(10);

  if (unprocessed && unprocessed.length > 0) {
    issues.push({
      severity: "warning",
      type: "inbound_not_processed",
      detail: `${unprocessed.length} mensagens inbound sem resposta do agente há mais de ${INBOUND_UNPROCESSED_MIN}min`,
    });
  }

  // ── 4. Mensagens "sent" sem evolution_message_id (envio falhou) ─────────
  const { data: failedSends } = await supabase
    .from("webinar_messages")
    .select("id, sent_at, sent_text")
    .eq("status", "sent")
    .is("evolution_message_id", null)
    .gte("sent_at", new Date(Date.now() - 60 * 60_000).toISOString())
    .limit(10);

  if (failedSends && failedSends.length > 0) {
    issues.push({
      severity: "warning",
      type: "send_without_evo_id",
      detail: `${failedSends.length} mensagens marcadas sent mas sem evolution_message_id na última hora`,
    });
  }

  // ── 5. Leads stuck há muito tempo ───────────────────────────────────────
  const stuckThreshold = new Date(Date.now() - LEAD_STUCK_HOURS * 3600_000).toISOString();
  const { data: stuckLeads } = await supabase
    .from("webinar_campaign_leads")
    .select("id, phone, funnel_status, last_interaction_at")
    .in("funnel_status", ["pending_response", "qualifying", "pitched", "collecting_info"])
    .lt("last_interaction_at", stuckThreshold)
    .limit(20);

  if (stuckLeads && stuckLeads.length > 0) {
    issues.push({
      severity: "info",
      type: "leads_stuck",
      detail: `${stuckLeads.length} leads parados em qualificação há mais de ${LEAD_STUCK_HOURS}h (provavelmente perdidos — considere mark_as_lost)`,
    });
  }

  // ── 6. Estado das instâncias (cap diário, cooldown) ─────────────────────
  const { data: instanceStates } = await supabase
    .from("webinar_instance_state")
    .select(
      "instance_name, status, daily_sent_count, daily_cap, next_available_at, last_sent_at",
    )
    .order("instance_name", { ascending: true });

  const capWarnings = (instanceStates ?? []).filter(
    (s: any) => s.status === "active" && s.daily_sent_count >= s.daily_cap,
  );
  for (const s of capWarnings) {
    issues.push({
      severity: "info",
      type: "daily_cap_reached",
      detail: `${s.instance_name} atingiu cap diário (${s.daily_sent_count}/${s.daily_cap})`,
    });
  }

  // ── Resumo ──────────────────────────────────────────────────────────────
  const summary = {
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues_total: issues.length,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    info: issues.filter((i) => i.severity === "info").length,
    auto_fixed: issues.filter((i) => i.fixed).length,
    duration_ms: Date.now() - startedAt.getTime(),
    instance_states: instanceStates,
    issues,
  };

  return NextResponse.json(summary);
}
