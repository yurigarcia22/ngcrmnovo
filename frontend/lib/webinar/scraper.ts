/**
 * Client do ng-scraper-google.
 *
 * Endpoints:
 * - POST /scrape/async         { nicho, cidades[], max_per_city } -> { job_id }
 * - GET  /jobs/{id}            -> { status, result?, error? }
 * - GET  /health               -> { status: "ok" }
 *
 * Sem auth quando SCRAPER_API_KEY tá vazia no scraper. Se um dia setarem,
 * a gente passa via SCRAPER_API_KEY env aqui também.
 */

const SCRAPER_URL =
  process.env.SCRAPER_URL ?? "https://n8n-ng-scraper-google.q0qki5.easypanel.host";
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY ?? "";

export type ScrapedCompany = {
  title?: string | null;
  phone?: string | null;
  website?: string | null;
  totalScore?: number | null;
  reviewsCount?: number;
  imagesCount?: number;
  address?: string | null;
};

export type ScrapeJobStatus = "queued" | "running" | "done" | "error";

export type ScrapeJob = {
  job_id: string;
  status: ScrapeJobStatus;
  result?: {
    total: number;
    companies: ScrapedCompany[];
    blocked: boolean;
    reason: string | null;
  };
  error?: string;
};

export async function startScrape(args: {
  nicho: string;
  cidades: string[];
  max_per_city: number;
}): Promise<{ ok: boolean; job_id?: string; error?: string }> {
  try {
    const body: any = { ...args };
    if (SCRAPER_API_KEY) body.api_key = SCRAPER_API_KEY;

    const res = await fetch(`${SCRAPER_URL}/scrape/async`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, job_id: data.job_id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch failed" };
  }
}

export async function getScrapeJob(
  jobId: string,
): Promise<{ ok: boolean; job?: ScrapeJob; error?: string }> {
  try {
    const res = await fetch(`${SCRAPER_URL}/jobs/${jobId}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const data = await res.json();
    return { ok: true, job: data as ScrapeJob };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch failed" };
  }
}

/**
 * Normaliza telefone do Google Maps pra formato 55XXXXXXXXXX.
 * Aceita formatos brasileiros: "+55 37 99999-9999", "(37) 99999-9999", etc.
 * Retorna null se não conseguir extrair número válido.
 */
export function normalizeBrazilianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Já tem 55 prefixo
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // Sem prefixo (10 ou 11 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return null;
}
