/**
 * Política de dispatch anti-ban: quiet hours + claim atômico de instância.
 *
 * Quiet hours: 2 janelas (9:00-11:30 e 14:00-17:30) America/Sao_Paulo.
 *   Excluir almoço e fim de tarde reduz padrão detectável de bot — humano
 *   comercial não dispara em horário cheio nem em 18h-20h fora do expediente.
 *
 * Cap diário: 40 disparos/chip/dia (modo CONSERVADOR pós-restrições maio/26).
 * Jitter por instância: 8-18 min entre disparos do mesmo chip.
 *
 * Override de janelas via env WEBINAR_DISPATCH_WINDOWS:
 *   "9:00-11:30,14:00-17:30" (formato HH:MM-HH:MM separado por vírgula)
 *
 * Retrocompatibilidade: se WEBINAR_DISPATCH_START_HOUR e END_HOUR
 * estiverem definidos, usa eles como 1 janela única.
 *
 * Veja migrations:
 *   20260430120000_webinar_instance_state.sql (estado base)
 *   20260513000000_webinar_tighten_dispatch.sql (cap 40, jitter 8-18min, warmup)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Quiet hours (janelas de disparo permitidas) ─────────────────────────
const TIMEZONE = "America/Sao_Paulo";

type DispatchWindow = { startMinutes: number; endMinutes: number };

/**
 * Parser de janela "HH:MM-HH:MM" → minutos absolutos do dia.
 * Retorna null se formato inválido (pulado silenciosamente).
 */
function parseWindow(raw: string): DispatchWindow | null {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{1,2}))?-(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const sh = Number(m[1]);
  const sm = m[2] ? Number(m[2]) : 0;
  const eh = Number(m[3]);
  const em = m[4] ? Number(m[4]) : 0;
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  if (sh < 0 || sh > 23 || eh < 0 || eh > 24 || sm < 0 || sm > 59 || em < 0 || em > 59) {
    return null;
  }
  return { startMinutes: sh * 60 + sm, endMinutes: eh * 60 + em };
}

/**
 * Carrega janelas de quiet hours na ordem:
 *   1. Se WEBINAR_DISPATCH_WINDOWS definido → parse "9:00-11:30,14:00-17:30"
 *   2. Senão se START_HOUR e END_HOUR definidos → 1 janela legacy
 *   3. Senão → default 9:00-11:30 + 14:00-17:30
 */
function loadWindows(): DispatchWindow[] {
  const raw = process.env.WEBINAR_DISPATCH_WINDOWS?.trim();
  if (raw) {
    const parsed = raw
      .split(",")
      .map((w) => parseWindow(w))
      .filter((w): w is DispatchWindow => w !== null);
    if (parsed.length > 0) return parsed;
  }

  const legacyStart = process.env.WEBINAR_DISPATCH_START_HOUR;
  const legacyEnd = process.env.WEBINAR_DISPATCH_END_HOUR;
  if (legacyStart !== undefined && legacyEnd !== undefined) {
    const sh = Number(legacyStart);
    const eh = Number(legacyEnd);
    if (!Number.isNaN(sh) && !Number.isNaN(eh)) {
      return [{ startMinutes: sh * 60, endMinutes: eh * 60 }];
    }
  }

  return [
    { startMinutes: 9 * 60, endMinutes: 11 * 60 + 30 },
    { startMinutes: 14 * 60, endMinutes: 17 * 60 + 30 },
  ];
}

const DISPATCH_WINDOWS: DispatchWindow[] = loadWindows();

/**
 * Retorna true se o horário atual está DENTRO de ALGUMA janela permitida.
 * Considera fuso horário de São Paulo (campanhas brasileiras).
 *
 * Categorias afetadas: initial_outreach (massivo).
 * agent_reply e cadências (reminder/nutricao) NÃO sofrem quiet hours,
 * pois respondem o usuário em tempo real.
 *
 * Suporta janelas que atravessam meia-noite (startMinutes > endMinutes).
 */
export function isWithinQuietHours(now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minutePart = parts.find((p) => p.type === "minute")?.value ?? "0";
  let hour = Number(hourPart);
  const minute = Number(minutePart);
  if (hour === 24) hour = 0;
  const currentMinutes = hour * 60 + minute;

  for (const win of DISPATCH_WINDOWS) {
    if (win.startMinutes <= win.endMinutes) {
      if (currentMinutes >= win.startMinutes && currentMinutes < win.endMinutes) {
        return true;
      }
    } else {
      // Janela atravessa meia-noite
      if (currentMinutes >= win.startMinutes || currentMinutes < win.endMinutes) {
        return true;
      }
    }
  }
  return false;
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
  capOverride?: number | null,
): Promise<ClaimResult> {
  const rpcArgs: Record<string, any> = { p_instance_name: instanceName };
  if (capOverride != null && capOverride > 0) {
    rpcArgs.p_cap_override = capOverride;
  }
  const { data, error } = await supabase.rpc("claim_webinar_instance", rpcArgs);
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
