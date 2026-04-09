import { toast as sonnerToast } from "sonner";

/**
 * Wrapper padronizado sobre sonner para feedback visual consistente.
 * Substitui o uso de alert() em todo o app.
 */
export const toast = {
    success: (message: string, description?: string) =>
        sonnerToast.success(message, { description }),
    error: (message: string, description?: string) =>
        sonnerToast.error(message, { description }),
    info: (message: string, description?: string) =>
        sonnerToast.info(message, { description }),
    warning: (message: string, description?: string) =>
        sonnerToast.warning(message, { description }),
    loading: (message: string) => sonnerToast.loading(message),
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
