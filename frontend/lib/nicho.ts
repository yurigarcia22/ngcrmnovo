// Normalizacao/canonicalizacao de nicho do cold-call. Junta duplicatas por
// caixa/acento e por apelido/categoria do Google Maps (vet, Clinica Veterinaria,
// Hospital Veterinario -> Veterinaria; cont, Assessoria contabil -> Contabilidade).
// O mesmo mapa foi aplicado no banco em 23/11/2026 (migration cold_call_revisao).

function stripAccents(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Chave de comparacao: sem acento, minuscula, espacos colapsados. */
export function nichoKey(s: string): string {
    return stripAccents(String(s || "")).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Nicho canonico -> apelidos (comparados pela nichoKey). */
export const NICHO_ALIASES: Record<string, string[]> = {
    "Contabilidade": [
        "contabilidade", "cont", "contabil", "contador", "contadores", "contador(a) certificado(a)",
        "assessoria contabil", "escritorio de contabilidade", "escritorio contabil",
        "servico de escrituracao contabil", "perito em contabilidade",
        "servico de contabilidade de custos", "servico de declaracao de impostos", "consultor fiscal",
    ],
    "Veterinária": [
        "veterinaria", "vet", "veterinario", "clinica veterinaria", "hospital veterinario",
        "servico veterinario de emergencia", "clinica vet",
    ],
    "Odontologia": ["odontologia", "odonto", "odnto", "dentista", "clinica odontologica", "consultorio odontologico"],
    "Medicina": ["medicina", "medico", "clinico geral", "clinica medica"],
    "Advocacia": [
        "advocacia", "advogado", "advogada", "escritorio de advocacia", "servicos juridicos",
        "advogado de praticas gerais", "advogado previdenciario", "advogado de direito de familia",
    ],
    "Imobiliária": ["imobiliaria", "corretor de imoveis", "corretora de imoveis"],
    "Energia Solar": ["energia solar", "solar", "empresa de energia solar"],
};

const ALIAS_INDEX: Map<string, string> = (() => {
    const m = new Map<string, string>();
    for (const [canon, aliases] of Object.entries(NICHO_ALIASES)) {
        m.set(nichoKey(canon), canon);
        for (const a of aliases) m.set(nichoKey(a), canon);
    }
    return m;
})();

/** Texto que veio da raspagem do Google Maps e nao e nicho ("⋅ Abre seg. as 08:00"). */
function isLixo(raw: string): boolean {
    const t = String(raw || "").trim();
    return /^[⋅·•]/.test(t) || /^(abre|fecha|aberto|fechado)\b/i.test(stripAccents(t));
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

export const NICHO_VAZIO = "Não informado";

/**
 * Retorna o nicho canonico: apelido conhecido -> nicho do mapa; senao, se casar
 * (sem acento/caixa) com um ja existente, usa o existente; senao Title Case.
 * Null se vazio ou lixo de raspagem.
 */
export function canonicalizeNicho(raw: string | null | undefined, existing: string[] = []): string | null {
    const key = nichoKey(raw || "");
    if (!key || isLixo(raw || "")) return null;
    const alias = ALIAS_INDEX.get(key);
    if (alias) return alias;
    const hit = existing.find((e) => nichoKey(e) === key);
    return hit || titleCase(raw || "");
}

/** Igual a canonicalizeNicho, mas nunca devolve vazio (a coluna nicho e NOT NULL). */
export function canonicalizeNichoOrDefault(raw: string | null | undefined, existing: string[] = []): string {
    return canonicalizeNicho(raw, existing) ?? NICHO_VAZIO;
}
