"use client";

import { useState, useTransition } from "react";
import { Lock, Mail, ShieldCheck, AlertCircle } from "lucide-react";
import { adminLoginAction } from "./actions";

export default function AdminLoginPage() {
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
            const res = await adminLoginAction(formData);
            if (!res.ok) {
                setError(res.error);
            }
            // sucesso => redirect ja foi disparado no server
        });
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
                    <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-8 py-6 text-white">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold leading-tight">
                                    Painel da Plataforma
                                </h1>
                                <p className="text-xs text-indigo-100">
                                    Acesso restrito a super-admins
                                </p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={onSubmit} className="px-8 py-7 space-y-5">
                        {error && (
                            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div>
                            <label
                                htmlFor="email"
                                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
                            >
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    disabled={isPending}
                                    className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label
                                htmlFor="password"
                                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
                            >
                                Senha
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    disabled={isPending}
                                    className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                                    placeholder=""
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isPending}
                            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                        >
                            {isPending ? "Entrando..." : "Entrar"}
                        </button>
                    </form>

                    <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 text-center">
                        <p className="text-[11px] text-slate-500">
                            Esta area e isolada da conta do CRM. Recuperacao de
                            senha apenas via SQL.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
