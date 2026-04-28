/**
 * Cliente Evolution API + rotação balanceada de instâncias (anti-ban).
 *
 * pickInstance v2: round-robin balanceado.
 *   - Filtra instâncias ativas no Evolution
 *   - Filtra as candidates da campanha
 *   - Conta uso recente (últimas 60 min) por instance
 *   - Pega top 3 menos usadas, sorteia entre elas (jitter pra evitar previsibilidade)
 *
 * Disparo com retry exponencial (2s/5s/15s) em erros transitórios.
 */

import { createServiceClient } from "@/utils/supabase/service";

const EVO_URL = (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
const EVO_TOKEN = process.env.EVOLUTION_API_TOKEN ?? "";

export type EvolutionInstance = {
  id: string;
  name: string;
  connectionStatus: "open" | "close" | "connecting";
  ownerJid?: string | null;
  profileName?: string | null;
};

async function evoFetch(path: string, init?: RequestInit) {
  if (!EVO_URL || !EVO_TOKEN) {
    throw new Error("EVOLUTION_API_URL/TOKEN não configurados");
  }
  return fetch(`${EVO_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      apikey: EVO_TOKEN,
      "Content-Type": "application/json",
    },
  });
}

export async function listEvolutionInstances(): Promise<EvolutionInstance[]> {
  const res = await evoFetch("/instance/fetchInstances");
  if (!res.ok) throw new Error(`Evolution ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((i: any) => ({
    id: i.id,
    name: i.name,
    connectionStatus: i.connectionStatus,
    ownerJid: i.ownerJid,
    profileName: i.profileName,
  }));
}

export async function setEvolutionWebhook(
  instanceName: string,
  webhookUrl: string,
): Promise<{ ok: boolean; enabled?: boolean; error?: string }> {
  const res = await evoFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        events: ["MESSAGES_UPSERT"],
        webhookByEvents: false,
        webhookBase64: false,
      },
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    return { ok: false, error: `Evolution ${res.status}: ${body.slice(0, 200)}` };
  }
  try {
    const json = JSON.parse(body);
    return { ok: true, enabled: json.enabled };
  } catch {
    return { ok: true };
  }
}

export type PickInstanceResult = {
  name: string;
  isFailover: boolean; // true se precisou trocar a instance preferida (caiu)
  preferredInstance: string | null;
};

/**
 * pickInstance v3 com lead affinity:
 *   1. Se preferredInstance está nas candidates E open -> usa ela (sem failover)
 *   2. Caso contrário -> round-robin balanceado entre as open
 *      retorna isFailover=true se preferredInstance existia e caiu
 *
 * Round-robin: pega top 3 menos usadas recentemente e sorteia (jitter anti-padrão).
 */
export async function pickInstance(args: {
  instance_names?: string[] | null;
  instance_name?: string | null;
  preferredInstance?: string | null;
}): Promise<PickInstanceResult | null> {
  const candidates = new Set<string>();
  if (args.instance_names) {
    for (const n of args.instance_names) {
      if (n && n.trim()) candidates.add(n.trim());
    }
  }
  if (args.instance_name && args.instance_name.trim()) {
    candidates.add(args.instance_name.trim());
  }
  if (candidates.size === 0) return null;

  const preferred = args.preferredInstance?.trim() || null;

  // Filtra as conectadas
  let live: EvolutionInstance[] = [];
  try {
    live = await listEvolutionInstances();
  } catch {
    // Se Evolution falhar, usa qualquer das candidates aleatoriamente
    const arr = Array.from(candidates);
    const fallback = arr[Math.floor(Math.random() * arr.length)];
    return {
      name: fallback,
      isFailover: preferred !== null && preferred !== fallback,
      preferredInstance: preferred,
    };
  }

  const open = live
    .filter((i) => i.connectionStatus === "open" && candidates.has(i.name))
    .map((i) => i.name);

  // 1. Lead affinity: preferred está open -> usa ela
  if (preferred && open.includes(preferred)) {
    return {
      name: preferred,
      isFailover: false,
      preferredInstance: preferred,
    };
  }

  // 2. Failover: preferred caiu (ou não existia). Roda round-robin balanceado
  if (open.length === 0) {
    const arr = Array.from(candidates);
    const fallback = arr[Math.floor(Math.random() * arr.length)];
    return {
      name: fallback,
      isFailover: preferred !== null && preferred !== fallback,
      preferredInstance: preferred,
    };
  }
  if (open.length === 1) {
    return {
      name: open[0],
      isFailover: preferred !== null && preferred !== open[0],
      preferredInstance: preferred,
    };
  }

  // Conta uso recente (60 min) por instance
  const supabase = createServiceClient();
  const sixtyMinAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const usage = new Map<string, number>();
  for (const name of open) usage.set(name, 0);

  try {
    const { data } = await supabase
      .from("webinar_messages")
      .select("instance_used")
      .gte("sent_at", sixtyMinAgo)
      .in("instance_used", open)
      .eq("status", "sent");

    if (data) {
      for (const row of data as any[]) {
        const name = row.instance_used;
        if (name) usage.set(name, (usage.get(name) ?? 0) + 1);
      }
    }
  } catch {}

  const sorted = open.sort((a, b) => (usage.get(a) ?? 0) - (usage.get(b) ?? 0));
  const top = sorted.slice(0, Math.min(3, sorted.length));
  const chosen = top[Math.floor(Math.random() * top.length)];

  return {
    name: chosen,
    isFailover: preferred !== null && preferred !== chosen,
    preferredInstance: preferred,
  };
}

/**
 * Envia texto com retry e backoff exponencial.
 * Backoff: 0s -> 2s -> 5s -> 15s. 3 retries no máximo.
 */
export async function sendTextViaEvolution(
  instanceName: string,
  number: string,
  text: string,
  opts: { maxRetries?: number } = {},
): Promise<{ ok: boolean; messageId?: string; error?: string; attempts?: number }> {
  const maxRetries = opts.maxRetries ?? 3;
  const backoffMs = [0, 2_000, 5_000, 15_000];
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, backoffMs[attempt] ?? 15_000));
    }
    try {
      const res = await evoFetch(
        `/message/sendText/${encodeURIComponent(instanceName)}`,
        {
          method: "POST",
          body: JSON.stringify({ number, text }),
        },
      );
      const body = await res.text();
      if (!res.ok) {
        lastError = `Evolution ${res.status}: ${body.slice(0, 200)}`;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { ok: false, error: lastError, attempts: attempt + 1 };
        }
        continue;
      }
      let json: any = {};
      try {
        json = JSON.parse(body);
      } catch {}
      return { ok: true, messageId: json?.key?.id, attempts: attempt + 1 };
    } catch (e: any) {
      lastError = e?.message ?? "fetch falhou";
    }
  }

  return { ok: false, error: lastError || "max retries", attempts: maxRetries + 1 };
}
