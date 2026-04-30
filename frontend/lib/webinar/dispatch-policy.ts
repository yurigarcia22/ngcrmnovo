/**
 * Política de dispatch anti-ban: quiet hours + claim atômico de instância.
 *
 * Quiet hours: 9h-20h America/Sao_Paulo (configurável via env).
 * Cap diário: 101 disparos/chip/dia (modo SEGURO, jitter 4-9min).
 * Jitter por instância: cada chip tem seu próprio next_available_at.
 *
 * Veja migration 20260430120000_webinar_instance_state.sql.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Quiet hours (janela de disparo permitida) ──────────────────────────
// Default: 9h às 20h horário de Brasília. Override via env:
//   WEBINAR_DISPATCH_START_HOUR (0-23)
//   WEBINAR_DISPATCH_END_HOUR   (0-23, exclusivo)
const TIMEZONE = "America/Sao_Paulo";
const START_HOUR = Number(process.env.WEBINAR_DISPATCH_START_HOUR ?? 9);
const END_HOUR = Number(process.env.WEBINAR_DISPATCH_END_HOUR ?? 20);

/**
 * Retorna true se o horário atual está DENTRO da janela permitida.
 * Considera fuso horário de São Paulo (campanhas brasileiras).
 *
 * Categorias afetadas: initial_outreach (massivo).
 * agent_reply e cadências (reminder/nutricao) NÃO sofrem quiet hours,
 * pois respondem o usuário em tempo real.
 */
export function isWithinQuietHours(now: Date = new Date()): boolean {
  // Pega a hora local em São Paulo via Intl
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  let hour = Number(hourPart);
  if (hour === 24) hour = 0;

  if (START_HOUR <= END_HOUR) {
    return hour >= START_HOUR && hour < END_HOUR;
  }
  // Janela atravessa meia-noite (não é o caso default, mas suporta)
  return hour >= START_HOUR || hour < END_HOUR;
}

export type ClaimResult = {
  granted: boolean;
  daily_sent: number;
  daily_cap: number;
  next_available_at: string;
  reason:
    | "ok"
    | "cooldown"
    | "daily_cap_reached"
    | "instance_status_paused"
    | "instance_status_banned"
    | string;
};

/**
 * Claim atômico de uma instância para envio.
 * Wrapper TypeScript da function claim_webinar_instance() do Postgres.
 *
 * Retorna granted=true se:
 *   - status=active
 *   - daily_sent_count < daily_cap
 *   - next_available_at <= now()
 * Caso contrário retorna granted=false com reason específico.
 *
 * IMPORTANTE: o claim é DESTRUTIVO. Se granted=true, o contador já foi
 * incrementado e o cooldown já foi reagendado. Se o envio falhar depois,
 * chamar releaseInstanceOnFailure() pra reverter.
 */
export async function claimInstance(
  supabase: SupabaseClient,
  instanceName: string,
): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_webinar_instance", {
    p_instance_name: instanceName,
  });
  if (error) {
    return {
      granted: false,
      daily_sent: 0,
      daily_cap: 0,
      next_available_at: new Date().toISOString(),
      reason: `rpc_error:${error.message}`,
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    granted: !!row?.granted,
    daily_sent: row?.daily_sent ?? 0,
    daily_cap: row?.daily_cap ?? 0,
    next_available_at: row?.next_available_at ?? new Date().toISOString(),
    reason: row?.reason ?? "unknown",
  };
}

/**
 * Reverte o claim quando o envio falha.
 * Decrementa daily_sent_count e libera next_available_at em 30s pra retry.
 */
export async function releaseInstanceOnFailure(
  supabase: SupabaseClient,
  instanceName: string,
): Promise<void> {
  await supabase.rpc("release_webinar_instance_on_failure", {
    p_instance_name: instanceName,
  });
}

/**
 * Pausa uma instância (ex: chip caiu detectado pelo health-check).
 * Reativar manualmente com setInstanceStatus("active").
 */
export async function setInstanceStatus(
  supabase: SupabaseClient,
  instanceName: string,
  status: "active" | "paused" | "banned",
  reason?: string,
): Promise<void> {
  await supabase
    .from("webinar_instance_state")
    .upsert(
      {
        instance_name: instanceName,
        status,
        paused_reason: status === "active" ? null : reason ?? null,
      },
      { onConflict: "instance_name" },
    );
}

/**
 * Categorias que respeitam quiet hours + cap diário + jitter por instância.
 * Outras categorias (agent_reply, reminder de cadência ativa) passam direto.
 */
export const RATE_LIMITED_CATEGORIES = new Set<string>([
  "initial_outreach",
]);

export function isRateLimited(category: string): boolean {
  return RATE_LIMITED_CATEGORIES.has(category);
}
