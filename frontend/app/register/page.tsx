'use client'

import { useState } from 'react'
import { signup } from '../login/actions'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function RegisterPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)

        const res = await signup(formData)

        if (res?.error) {
            setError(res.error)
            setLoading(false)
        }
        // Se sucesso, o redirect acontece no server action
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-4">
            <div className="w-full max-w-md bg-[#1E293B] rounded-2xl border border-gray-800 p-8 shadow-xl">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-blue-900/20">
                        E
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Crie sua conta</h1>
                    <p className="text-gray-400">Comece a gerenciar seus leads hoje mesmo.</p>
                </div>

                <form action={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Nome Completo
                        </label>
                        <input
                            name="full_name"
                            type="text"
                            required
                            className="w-full bg-[#0F172A] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                            placeholder="Seu nome"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Email
                        </label>
                        <input
                            name="email"
                            type="email"
                            required
                            className="w-full bg-[#0F172A] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                            placeholder="seu@email.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Senha
                        </label>
                        <input
                            name="password"
                            type="password"
                            required
                            minLength={6}
                            className="w-full bg-[#0F172A] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            'Criar Conta'
                        )}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-gray-400 text-sm">
                        Já tem uma conta?{' '}
                        <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                            Faça Login
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}
