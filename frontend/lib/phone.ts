/**
 * Normalizacao de telefone (Brasil) — usada para dedup de contatos.
 *
 * Formato canonico: 13 digitos = 55 + DDD(2) + 9 + 8 digitos.
 *
 * Inputs comuns que o sistema recebe:
 *   "11982216223"        -> "5511982216223"  (sem 55, ja com 9)
 *   "1182216223"         -> "55118 + 2216223" — invalido sem 9.
 *   "5511982216223"      -> "5511982216223"  (canonico, ok)
 *   "551182216223"       -> "5511982216223"  (12 chars sem 9, normalizado)
 *   "5511 9 8221-6223"   -> "5511982216223"  (com mascara, normalizado)
 */

export function cleanPhoneDigits(input: string): string {
    return (input ?? "").replace(/\D/g, "");
}

/**
 * Retorna o telefone no formato canonico (13 chars com 9) quando possivel.
 * Se nao for um numero BR reconhecivel, retorna o input limpo (so digitos).
 */
export function normalizeToCanonical(input: string): string {
    const digits = cleanPhoneDigits(input);

    // 11 digitos: assume Brasil sem o "55" (DDD + 9 + 8 digitos)
    if (digits.length === 11) return "55" + digits;

    // 10 digitos: numero antigo sem o "9". Adiciona "55" e o "9".
    if (digits.length === 10) {
        const ddd = digits.substring(0, 2);
        const rest = digits.substring(2);
        return "55" + ddd + "9" + rest;
    }

    // 13 chars comecando com 55: ja canonico
    if (digits.length === 13 && digits.startsWith("55")) return digits;

    // 12 chars comecando com 55: 55 + DDD + 8 digitos (faltando o "9")
    if (digits.length === 12 && digits.startsWith("55")) {
        return digits.substring(0, 4) + "9" + digits.substring(4);
    }

    return digits;
}

/**
 * Retorna todas as variantes do telefone que devem ser checadas no banco
 * para detectar duplicatas (canonico, sem 55, sem o "9", etc).
 */
export function getPossibleVariants(input: string): string[] {
    const digits = cleanPhoneDigits(input);
    const canonical = normalizeToCanonical(input);
    const set = new Set<string>();
    set.add(canonical);
    set.add(digits);

    // Sem 55 prefix
    if (canonical.length === 13 && canonical.startsWith("55")) {
        set.add(canonical.substring(2));
    }
    // Sem o "9" (caso legacy)
    if (canonical.length === 13 && canonical[4] === "9") {
        set.add(canonical.substring(0, 4) + canonical.substring(5));
    }
    // Sem 55 nem 9
    if (canonical.length === 13 && canonical[4] === "9") {
        set.add(canonical.substring(2, 4) + canonical.substring(5));
    }
    return Array.from(set).filter(Boolean);
}

/**
 * Valida se o input parece um telefone BR razoavel.
 * Bloqueia numeros muito curtos (testes lixo).
 */
export function isPlausibleBRPhone(input: string): boolean {
    const digits = cleanPhoneDigits(input);
    return digits.length >= 10 && digits.length <= 13;
}
