/**
 * Cliente Evolution API + rotacao de instances anti-ban.
 */

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
    throw new Error("EVOLUTION_API_URL/TOKEN nao configurados");
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

/**
 * Escolhe uma instance disponivel da campanha (rotacao anti-ban).
 *
 * Algoritmo:
 *   1. Filtra instances do campaign que estao "open" no Evolution
 *   2. Se nenhuma open, usa a `instance_name` legacy se estiver open
 *   3. Sorteia aleatoriamente entre as disponiveis
 *
 * Retorna null se nenhuma instance disponivel.
 */
export async function pickInstance(args: {
  instance_names?: string[] | null;
  instance_name?: string | null;
}): Promise<string | null> {
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

  let live: EvolutionInstance[] = [];
  try {
    live = await listEvolutionInstances();
  } catch {
    // Se Evolution falhar, ainda tenta uma aleatoria das candidates
    const arr = Array.from(candidates);
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const open = live.filter(
    (i) => i.connectionStatus === "open" && candidates.has(i.name),
  );
  if (open.length === 0) {
    // Fallback: pega qualquer das candidates (pode ser que Evolution liste estranho)
    const arr = Array.from(candidates);
    return arr[Math.floor(Math.random() * arr.length)];
  }

  return open[Math.floor(Math.random() * open.length)].name;
}

/**
 * Envia texto com retry e backoff exponencial.
 * Backoff: 0s -> 2s -> 5s -> 15s. 3 retries no maximo.
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
        // 4xx (bad request) NAO faz retry — erro de payload, nao de rede
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { ok: false, error: lastError, attempts: attempt + 1 };
        }
        continue; // 5xx ou 429 — tenta de novo
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
