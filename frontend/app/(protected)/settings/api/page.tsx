import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { listApiKeys } from "./actions";
import ApiSettingsClient from "./ApiSettingsClient";

export const dynamic = "force-dynamic";

export default async function ApiSettingsPage() {
    const res = await listApiKeys();
    return (
        <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
            <PageHeader
                title="API & Integrações"
                description="Chaves de API para conectar o CRM a ferramentas externas (n8n, automações, ponte com o SimplesVet)."
                icon={<KeyRound className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "API & Integrações" },
                ]}
            />
            <ApiSettingsClient initialKeys={res.keys || []} />
        </div>
    );
}
