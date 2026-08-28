/**
 * Discador configuravel por usuario (fica no localStorage do navegador, nao no
 * banco: e uma preferencia da MAQUINA — o mesmo vendedor pode usar MicroSIP no
 * PC do escritorio e Smart SIP Phone no Mac de casa).
 *
 * Motivo: o MicroSIP (Windows) responde a `sip:`, mas nem todo softphone de
 * macOS registra esse esquema. Em vez de chutar um formato unico, deixamos o
 * usuario escolher e ainda permitimos um template proprio.
 */

export type DialerId = "sip" | "tel" | "callto" | "custom";

export interface DialerConfig {
    id: DialerId;
    /** Template com {phone} (E.164 com +) e {digits} (so numeros). Usado quando id='custom'. */
    template?: string;
}

const LS_KEY = "dialer:config";

export const DIALER_PRESETS: { id: DialerId; label: string; hint: string; scheme: string }[] = [
    { id: "sip", label: "SIP — MicroSIP, Smart SIP Phone, Zoiper", hint: "Windows e Mac. No Mac, veja a dica abaixo se abrir o app errado.", scheme: "sip:{phone}" },
    { id: "tel", label: "Discador do sistema (tel:)", hint: "Atenção no Mac: o macOS costuma mandar tel: para o Telefone.app da Apple, não para o softphone.", scheme: "tel:{phone}" },
    { id: "callto", label: "Callto (Skype e similares)", hint: "Alternativa quando os outros não abrem", scheme: "callto:{phone}" },
    { id: "custom", label: "Personalizado", hint: "Cole o formato do seu softphone", scheme: "" },
];

export function getDialerConfig(): DialerConfig {
    if (typeof window === "undefined") return { id: "sip" };
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { id: "sip" };
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.id === "string") return parsed as DialerConfig;
    } catch { /* config corrompida: cai no padrao */ }
    return { id: "sip" };
}

export function setDialerConfig(cfg: DialerConfig) {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* modo privado */ }
}

/** Normaliza para E.164 brasileiro: 11 digitos -> +55..., ja internacional -> +... */
export function toE164(phone: string): string {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10 || digits.length === 11) return "+55" + digits;
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return "+" + digits;
    return "+" + digits;
}

/** Monta a URL final de discagem conforme a preferencia do usuario. */
export function buildDialUrl(phone: string, cfg: DialerConfig = getDialerConfig()): string {
    const e164 = toE164(phone);
    const digits = e164.replace(/\D/g, "");
    if (cfg.id === "custom" && cfg.template) {
        return cfg.template.replace(/\{phone\}/g, e164).replace(/\{digits\}/g, digits);
    }
    const preset = DIALER_PRESETS.find((p) => p.id === cfg.id) ?? DIALER_PRESETS[0];
    return preset.scheme.replace(/\{phone\}/g, e164);
}

/**
 * Dispara a ligacao. Usa window.location.href porque e o unico jeito de o SO
 * entregar o link ao app registrado sem abrir aba em branco.
 */
export function dial(phone: string): boolean {
    const url = buildDialUrl(phone);
    if (!url) return false;
    try {
        window.location.href = url;
        return true;
    } catch {
        return false;
    }
}
