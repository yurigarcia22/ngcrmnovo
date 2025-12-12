"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import SetupForm from "./SetupForm";
import { Loader2 } from "lucide-react";

export default function SetupPage() {
    const [verifying, setVerifying] = useState(true);
    const [session, setSession] = useState<any>(null);
    const supabase = createClient();
    const router = useRouter();

    useEffect(() => {
        const handleAuth = async () => {
            // 1. Tentar pegar da URL (Hash) se vier de um Magic Link/Invite "Implicit"
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const accessToken = hashParams.get("access_token");
            const refreshToken = hashParams.get("refresh_token");

            if (accessToken && refreshToken) {
                console.log("Setup Page: Tokens encontrados na URL. Configurando sessão...");
                const { error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });

                if (error) console.error("Erro ao setar sessão via URL:", error);
                // Limpa o hash para ficar limpo
                window.history.replaceState(null, "", window.location.pathname);
            }

            // 2. Verificar se temos sessão válida (seja via cookie antigo ou setSession acima)
            const { data: { session: currentSession } } = await supabase.auth.getSession();

            if (currentSession) {
                console.log("Setup Page: Sessão válida encontrada.");
                setSession(currentSession);
                setVerifying(false);
            } else {
                console.log("Setup Page: Nenhuma sessão. Redirecionando para login.");
                router.push("/login?error=setup_unauthorized");
            }
        };

        handleAuth();
    }, [supabase, router]);

    if (verifying) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
                <p className="text-gray-500">Verificando convite...</p>
            </div>
        );
    }

    if (!session) return null; // Já redirecionou no useEffect

    return <SetupForm />;
}
