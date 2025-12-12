"use client";

import { useState } from "react";
import { Loader2, ArrowRight, CheckCircle, Lock, User } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function SetupForm() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supabase = createClient();
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const fullName = formData.get("fullName") as string;
        const password = formData.get("password") as string;
        const confirmPassword = formData.get("confirmPassword") as string;

        try {
            if (password !== confirmPassword) {
                throw new Error("As senhas não coincidem.");
            }
            if (password.length < 6) {
                throw new Error("A senha deve ter pelo menos 6 caracteres.");
            }

            // 1. Atualizar Senha (Client Side)
            const { error: authError } = await supabase.auth.updateUser({ password });
            if (authError) throw authError;

            // 2. Atualizar Perfil (Client Side - RLS permite update do próprio profile)
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error: profileError } = await supabase
                    .from("profiles")
                    .update({ full_name: fullName })
                    .eq("id", user.id);

                if (profileError) {
                    console.error("Profile Update Error:", profileError);
                }
            } else {
                throw new Error("Usuário não encontrado após atualização de senha.");
            }

            // Sucesso cleanup
            router.push("/");
            router.refresh();

        } catch (e: any) {
            setError(e.message || "Erro inesperado.");
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="bg-blue-600 p-8 text-center">
                    <h1 className="text-2xl font-bold text-white mb-2">Bem-vindo ao CRM NG</h1>
                    <p className="text-blue-100">Configure sua conta para acessar a empresa.</p>
                </div>

                <div className="p-8 pt-10">
                    {error && (
                        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 text-red-700 text-sm rounded-r">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Nome Completo</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    required
                                    name="fullName"
                                    type="text"
                                    placeholder="Ex: Ana Silva"
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Nova Senha</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    required
                                    name="password"
                                    type="password"
                                    minLength={6}
                                    placeholder="••••••••"
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Confirmar Senha</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <CheckCircle className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                    required
                                    name="confirmPassword"
                                    type="password"
                                    minLength={6}
                                    placeholder="••••••••"
                                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 transition-all hover:scale-[1.01]"
                        >
                            {loading ? (
                                <Loader2 className="animate-spin h-5 w-5" />
                            ) : (
                                <span className="flex items-center gap-2">
                                    Concluir Cadastro <ArrowRight size={16} />
                                </span>
                            )}
                        </button>
                    </form>
                </div>
                <div className="bg-gray-50 p-4 text-center text-xs text-gray-400 border-t border-gray-100">
                    &copy; 2025 CRM NG. Todos os direitos reservados.
                </div>
            </div>
        </div>
    );
}
