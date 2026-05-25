/**
 * Layout root da area /admin.
 *
 * Importante: nao reutiliza o ProtectedLayout (que assume Supabase Auth).
 * Auth de /admin e validada no middleware (cookie admin_session).
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Painel da Plataforma — NG",
    description: "Gestao de tenants do CRM NG",
    robots: { index: false, follow: false },
};

export default function AdminRootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50 antialiased">
            {children}
        </div>
    );
}
