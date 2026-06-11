import { toast as sonnerToast } from "sonner";

/**
 * Garante que qualquer valor vire string legivel pro toast.
 * Sem isso, passar {error: ...} como description aparecia como "[object Object]".
 */
function toText(v: unknown): string | undefined {
    if (v == null) return undefined;
    if (typeof v === "string") return v;
    if (v instanceof Error) return v.message;
    if (typeof v === "object") {
        const anyV = v as Record<string, unknown>;
        if (typeof anyV.message === "string") return anyV.message;
        if (typeof anyV.error === "string") return anyV.error;
        try { return JSON.stringify(v); } catch { return String(v); }
    }
    return String(v);
}

/**
 * Wrapper padronizado sobre sonner para feedback visual consistente.
 * Substitui o uso de alert() em todo o app.
 */
export const toast = {
    success: (message: unknown, description?: unknown) =>
        sonnerToast.success(toText(message) ?? "Sucesso", { description: toText(description) }),
    error: (message: unknown, description?: unknown) =>
        sonnerToast.error(toText(message) ?? "Erro", { description: toText(description) }),
    info: (message: unknown, description?: unknown) =>
        sonnerToast.info(toText(message) ?? "", { description: toText(description) }),
    warning: (message: unknown, description?: unknown) =>
        sonnerToast.warning(toText(message) ?? "", { description: toText(description) }),
    loading: (message: unknown) => sonnerToast.loading(toText(message) ?? ""),
    dismiss: (id?: string | number) => sonnerToast.dismiss(id),
    promise: <T,>(
        promise: Promise<T>,
        messages: {
            loading: string;
            success: string | ((data: T) => string);
            error: string | ((err: unknown) => string);
        }
    ) => sonnerToast.promise(promise, messages),
};
