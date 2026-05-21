/**
 * Validador de WhatsApp via Evolution API.
 *
 * Chama POST /chat/whatsappNumbers/{instance} com array de números.
 * Evolution retorna [{ jid, exists, number }, ...]
 *
 * - exists=true → tem WhatsApp ativo
 * - exists=false → não tem WhatsApp (ou número morto)
 *
 * Uso típico:
 *   const res = await validateWhatsAppBatch(["5551991234567", ...]);
 *   res.results.forEach(r => { if (r.exists) ... })
 */

const EVO_URL =
  process.env.EVOLUTION_URL ??
  "https://evolution-evolution-api.q0qki5.easypanel.host";
const EVO_API_KEY = process.env.EVOLUTION_API_KEY ?? "osHNctoYjoDgcz4K5aOEvqT5NwASGM7p";

export type WhatsAppCheckResult = {
  number: string;
  jid: string | null;
  exists: boolean;
};

/**
 * Pega lista de instâncias conectadas e retorna a primeira `open`.
 * Usada como instance "técnica" pra fazer validação (não precisa ser
 * a instância da campanha — qualquer chip online vale).
 */
async function pickValidationInstance(): Promise<string | null> {
  try {
    const res = await fetch(`${EVO_URL}/instance/fetchInstances`, {
      headers: { apikey: EVO_API_KEY },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    for (const inst of list) {
      const status =
        inst?.connectionStatus ?? inst?.instance?.connectionStatus ?? null;
      const name = inst?.name ?? inst?.instance?.instanceName ?? null;
      if (status === "open" && name) return name;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Valida números em batch chamando Evolution. Aceita até ~50 por chamada
 * (limite recomendado). Acima disso, faz múltiplas chamadas em série.
 *
 * Retorna array com mesmo length do input. Se Evolution falhar, retorna
 * exists=false com jid=null (lead vai pra revisão manual).
 */
export async function validateWhatsAppBatch(
  numbers: string[],
  instanceOverride?: string | null,
): Promise<{
  ok: boolean;
  instance?: string;
  results: WhatsAppCheckResult[];
  error?: string;
}> {
  if (numbers.length === 0) return { ok: true, results: [] };

  const instance = instanceOverride ?? (await pickValidationInstance());
  if (!instance) {
    return {
      ok: false,
      results: numbers.map((n) => ({ number: n, jid: null, exists: false })),
      error: "no_validation_instance_available",
    };
  }

  const BATCH = 50;
  const results: WhatsAppCheckResult[] = [];

  for (let i = 0; i < numbers.length; i += BATCH) {
    const slice = numbers.slice(i, i + BATCH);
    try {
      const res = await fetch(
        `${EVO_URL}/chat/whatsappNumbers/${encodeURIComponent(instance)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: EVO_API_KEY,
          },
          body: JSON.stringify({ numbers: slice }),
        },
      );
      if (!res.ok) {
        // Marca todos da batch como falha
        for (const n of slice) {
          results.push({ number: n, jid: null, exists: false });
        }
        continue;
      }
      const data = await res.json();
      // Evolution retorna array de objetos { jid, exists, number }
      const arr = Array.isArray(data) ? data : data?.response ?? [];
      // Mapeia by number (Evolution responde com mesmo número de input)
      const byNumber = new Map<string, any>();
      for (const item of arr) {
        const num = String(item?.number ?? "").replace(/\D/g, "");
        if (num) byNumber.set(num, item);
      }
      for (const n of slice) {
        const norm = String(n).replace(/\D/g, "");
        const item = byNumber.get(norm);
        if (item) {
          results.push({
            number: n,
            jid: item.jid ?? null,
            exists: !!item.exists,
          });
        } else {
          // Evolution não retornou pra esse número — marca como falha
          results.push({ number: n, jid: null, exists: false });
        }
      }
    } catch (e) {
      for (const n of slice) {
        results.push({ number: n, jid: null, exists: false });
      }
    }
  }

  return { ok: true, instance, results };
}

/**
 * Faz scrape simples do site da clínica procurando contatos.
 * Extrai:
 * - wa.me/55... → telefone WhatsApp
 * - tel:+55... → telefone (pode não ser WhatsApp)
 * - mailto:... → email
 *
 * Retorna até 5 telefones únicos encontrados (formato 5511XXXXXXXXX).
 */
export async function extractContactsFromWebsite(
  url: string,
): Promise<{ phones: string[]; emails: string[]; error?: string }> {
  if (!url || !url.startsWith("http")) {
    return { phones: [], emails: [], error: "invalid_url" };
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { phones: [], emails: [], error: `http_${res.status}` };
    }
    const html = await res.text();

    // Regex pra wa.me/[opt+]NÚMERO
    const waMeRe = /wa\.me\/(?:\+?55)?(\d{10,13})/gi;
    // Regex pra tel:+55XX...
    const telRe = /tel:(?:\+?55)?(\d{10,13})/gi;
    // Regex pra api.whatsapp.com/send?phone=55XX...
    const apiWhatsRe = /api\.whatsapp\.com\/send\?phone=(?:\+?55)?(\d{10,13})/gi;
    // Regex pra emails
    const emailRe = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

    const phones = new Set<string>();
    const emails = new Set<string>();

    for (const re of [waMeRe, telRe, apiWhatsRe]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        let n = m[1].replace(/\D/g, "");
        if (!n.startsWith("55")) n = "55" + n;
        // Aceita 12 ou 13 dígitos brasileiros (com prefixo 55)
        if (n.length === 12 || n.length === 13) phones.add(n);
      }
    }
    let em: RegExpExecArray | null;
    while ((em = emailRe.exec(html)) !== null) {
      emails.add(em[0].toLowerCase());
    }

    return {
      phones: Array.from(phones).slice(0, 5),
      emails: Array.from(emails).slice(0, 3),
    };
  } catch (e: any) {
    return {
      phones: [],
      emails: [],
      error: e?.message ?? "fetch_failed",
    };
  }
}
