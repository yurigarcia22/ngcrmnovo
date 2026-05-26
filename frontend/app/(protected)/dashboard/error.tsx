"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[Dashboard Error]", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-slate-900 text-white p-8 flex items-center justify-center">
            <div className="max-w-3xl w-full bg-rose-950/30 border border-rose-500/30 rounded-2xl p-8">
                <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle className="w-6 h-6 text-rose-400" />
                    <h1 className="text-xl font-bold">Erro ao carregar o dashboard</h1>
                </div>

                <p className="text-sm text-rose-200 mb-4">
                    Algo deu errado ao gerar a página. Detalhes técnicos abaixo:
                </p>

                <div className="bg-black/40 rounded-lg p-4 mb-4 overflow-auto">
                    <div className="text-xs font-mono text-rose-300 whitespace-pre-wrap break-all">
                        <strong>Mensagem:</strong> {error.message ?? "(sem mensagem)"}
                    </div>
                    {error.digest && (
                        <div className="text-xs font-mono text-rose-400 mt-2">
                            <strong>Digest:</strong> {error.digest}
                        </div>
                    )}
                    {error.stack && (
                        <details className="mt-3">
                            <summary className="text-xs text-rose-300 cursor-pointer">Stack trace</summary>
                            <pre className="text-[10px] mt-2 text-rose-200 whitespace-pre-wrap">
                                {error.stack}
                            </pre>
                        </details>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={reset}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-semibold"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Tentar de novo
                    </button>
                </div>

                <p className="text-[11px] text-rose-300 mt-4 opacity-70">
                    Tire um print desta página inteira e mande para que possamos consertar.
                </p>
            </div>
        </div>
    );
}
