import { NextResponse, type NextRequest } from "next/server";
// Importa a função de sessão. Se ela não existir, criaremos no passo 2.
// Garanta que o caminho esteja correto para o seu projeto.
import { updateSession } from "./utils/supabase/middleware";

export async function middleware(request: NextRequest) {
    try {
        // Tenta atualizar a sessão do usuário
        return await updateSession(request);
    } catch (e) {
        // EM CASO DE ERRO CRÍTICO (Variáveis faltando, Supabase fora do ar, etc):
        console.error("❌ Middleware Error:", e);

        // "Fail-Open": Permite que a requisição continue para a página
        // Isso evita a tela de erro 500. O usuário apenas parecerá deslogado.
        return NextResponse.next({
            request: {
                headers: request.headers,
            },
        });
    }
}

export const config = {
    matcher: [
        // Matcher otimizado para ignorar arquivos estáticos e imagens
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
