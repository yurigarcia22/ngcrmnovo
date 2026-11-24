// Datas no fuso do Brasil (America/Sao_Paulo). O servidor (Docker/Vercel) roda em
// UTC e o Postgres trata horario sem fuso como UTC: sem isso, "hoje" vira amanha
// depois das 21h e uma reuniao das 14h aparece as 11h.

export const BR_TZ = "America/Sao_Paulo";

/** Data de hoje no Brasil, no formato YYYY-MM-DD. */
export function todayBR(base: Date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: BR_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(base);
}

/** Soma dias a uma data YYYY-MM-DD (sem depender do fuso da maquina). */
export function addDaysYMD(ymd: string, days: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days));
    return dt.toISOString().slice(0, 10);
}

/** Inicio e fim (ISO em UTC) de um dia do Brasil. O Brasil nao tem horario de verao desde 2019 (UTC-3). */
export function dayRangeBR(ymd: string = todayBR()): { start: string; end: string } {
    return {
        start: new Date(`${ymd}T00:00:00-03:00`).toISOString(),
        end: new Date(`${ymd}T23:59:59.999-03:00`).toISOString(),
    };
}

/**
 * Converte o valor de um <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"), que e
 * horario de Brasilia, em ISO com fuso. Valor que ja tem fuso (Z ou +hh:mm) passa direto.
 */
export function brLocalToISO(value: string | null | undefined): string | null {
    if (!value) return null;
    const v = String(value).trim();
    if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) return new Date(v).toISOString();
    const withSec = /T\d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
    const d = new Date(`${withSec}-03:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Telefone canonico (5511987654321) para exibicao: (11) 98765-4321. */
export function formatPhoneBR(raw: string | null | undefined): string {
    const d = String(raw || "").replace(/\D/g, "");
    const local = d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
    if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    return raw || "";
}
