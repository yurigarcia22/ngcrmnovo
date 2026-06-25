// Normalizacao/canonicalizacao de nicho do cold-call. Evita a bagunca de
// duplicatas por caixa/acento/abreviacao (Veterinaria/VET/Veterinária -> 1 so).

function stripAccents(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Chave de comparacao: sem acento, minuscula, espacos colapsados. */
export function nichoKey(s: string): string {
    return stripAccents(String(s || "")).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Title Case simples, preservando conectivos minusculos (de/da/do/e). */
function titleCase(s: string): string {
    const small = new Set(["de", "da", "do", "das", "dos", "e"]);
    return String(s || "")
        .trim()
        .replace(/\s+/g, " ")
        .split(" ")
        .map((w, i) => {
            const lw = w.toLowerCase();
            if (i > 0 && small.has(lw)) return lw;
            return lw.charAt(0).toUpperCase() + lw.slice(1);
        })
        .join(" ");
}

/**
 * Retorna o nicho canonico: se casar (sem acento/caixa) com um ja existente,
 * usa o existente; senao, normaliza pra Title Case. Null se vazio.
 */
export function canonicalizeNicho(raw: string | null | undefined, existing: string[] = []): string | null {
    const key = nichoKey(raw || "");
    if (!key) return null;
    const hit = existing.find((e) => nichoKey(e) === key);
    return hit || titleCase(raw || "");
}
