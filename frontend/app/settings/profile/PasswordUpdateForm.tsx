"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Lock, Save, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function PasswordUpdateForm() {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [msg, setMsg] = useState("");

    const supabase = createClient();

    async function handleUpdatePassword(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setStatus("idle");
        setMsg("");

        if (password.length < 6) {
            setStatus("error");
            setMsg("A senha deve ter pelo menos 6 caracteres.");
            setLoading(false);
            return;
        }

        const { error } = await supabase.auth.updateUser({ password: password });

        if (error) {
            setStatus("error");
            setMsg(error.message);
        } else {
            setStatus("success");
            setMsg("Senha atualizada com sucesso!");
            setPassword("");
        }
        setLoading(false);
    }

    return (
        <form onSubmit={handleUpdatePassword} className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Lock size={18} className="text-blue-500" />
                Segurança
            </h3>

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Definir Nova Senha</label>
                <div className="relative">
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Digite sua nova senha"
                        className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                    Se você acessou via convite, defina uma senha agora para garantir seu próximo acesso.
                </p>
            </div>

            {status === "error" && (
                <div className="flex items-center gap-2 text-red-600 text-sm mb-4 bg-red-50 p-3 rounded-lg">
                    <AlertCircle size={16} />
                    {msg}
                </div>
            )}

            {status === "success" && (
                <div className="flex items-center gap-2 text-green-600 text-sm mb-4 bg-green-50 p-3 rounded-lg">
                    <CheckCircle size={16} />
                    {msg}
                </div>
            )}

            <div className="flex justify-end">
                <button
                    type="submit"
                    disabled={loading || !password}
                    className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Atualizar Senha
                </button>
            </div>
        </form>
    );
}
