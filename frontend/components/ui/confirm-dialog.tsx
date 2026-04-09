"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback, useRef } from "react";
import { AlertTriangle, Info, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmTone = "default" | "danger" | "warning";

type ConfirmOptions = {
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    tone?: ConfirmTone;
};

type Resolver = (ok: boolean) => void;

type ConfirmContextValue = {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const [loading, setLoading] = useState(false);
    const resolverRef = useRef<Resolver | null>(null);

    const confirm = useCallback((opts: ConfirmOptions) => {
        setOptions(opts);
        setOpen(true);
        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
        });
    }, []);

    const handleResult = useCallback((ok: boolean) => {
        resolverRef.current?.(ok);
        resolverRef.current = null;
        setOpen(false);
        setTimeout(() => {
            setOptions(null);
            setLoading(false);
        }, 150);
    }, []);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleResult(false);
            if (e.key === "Enter") handleResult(true);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, handleResult]);

    const tone: ConfirmTone = options?.tone ?? "default";

    const toneStyles = {
        default: {
            iconBg: "bg-indigo-50",
            iconColor: "text-indigo-600",
            button: "bg-indigo-600 hover:bg-indigo-700 text-white",
            Icon: Info,
        },
        danger: {
            iconBg: "bg-red-50",
            iconColor: "text-red-600",
            button: "bg-red-600 hover:bg-red-700 text-white",
            Icon: Trash2,
        },
        warning: {
            iconBg: "bg-amber-50",
            iconColor: "text-amber-600",
            button: "bg-amber-600 hover:bg-amber-700 text-white",
            Icon: AlertTriangle,
        },
    }[tone];

    const Icon = toneStyles.Icon;

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {open && options && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-dialog-title"
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) handleResult(false);
                    }}
                >
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in duration-200">
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center shrink-0", toneStyles.iconBg)}>
                                    <Icon className={cn("w-6 h-6", toneStyles.iconColor)} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 id="confirm-dialog-title" className="text-lg font-bold text-slate-900 leading-tight">
                                        {options.title}
                                    </h2>
                                    {options.description && (
                                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                                            {options.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => handleResult(false)}
                                disabled={loading}
                                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
                            >
                                {options.cancelText ?? "Cancelar"}
                            </button>
                            <button
                                type="button"
                                autoFocus
                                onClick={() => {
                                    setLoading(true);
                                    handleResult(true);
                                }}
                                disabled={loading}
                                className={cn(
                                    "px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-2",
                                    toneStyles.button
                                )}
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {options.confirmText ?? "Confirmar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) {
        throw new Error("useConfirm must be used within <ConfirmProvider>");
    }
    return ctx.confirm;
}
