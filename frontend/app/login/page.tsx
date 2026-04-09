'use client'

import { useState } from 'react'
import { login } from './actions'
import { Loader2, Lock, Mail, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)

        const result = await login(formData)

        if (result?.error) {
            setError(result.error)
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-4 relative overflow-hidden">
            {/* Decorative background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
                    <div className="text-center mb-8">
                        <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 mx-auto mb-4">
                            <Lock className="h-6 w-6" />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bem-vindo de volta</h1>
                        <p className="text-slate-500 mt-2 text-sm">Entre com suas credenciais para acessar o CRM NG</p>
                    </div>

                    <form action={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="email" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    className="block w-full h-11 pl-10 pr-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                    placeholder="seu@email.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
                                Senha
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    className="block w-full h-11 pl-10 pr-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                    placeholder="Digite sua senha"
                                />
                            </div>
                        </div>

                        {error && (
                            <div
                                role="alert"
                                className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg animate-in fade-in duration-200"
                            >
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm active:scale-[0.98]"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin h-4 w-4" />
                                    Entrando...
                                </>
                            ) : (
                                "Entrar"
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-slate-500 text-sm">
                            Nao tem uma conta?{" "}
                            <Link href="/register" className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors">
                                Cadastre-se
                            </Link>
                        </p>
                    </div>
                </div>

                <p className="text-center mt-6 text-xs text-slate-400">
                    CRM NG - Gestao inteligente de relacionamento
                </p>
            </div>
        </div>
    )
}
