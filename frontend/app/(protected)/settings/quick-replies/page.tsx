import { createClient } from "@/utils/supabase/server";
import { Zap } from "lucide-react";
import QuickReplyManager from "@/components/QuickReplyManager";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = 'force-dynamic';

export default async function QuickRepliesPage() {
    const supabase = await createClient();

    const { data: quickReplies } = await supabase
        .from("quick_replies")
        .select("*")
        .order("category", { ascending: true });

    return (
        <div className="max-w-6xl mx-auto">
            <PageHeader
                title="Respostas Rapidas"
                description="Crie mensagens pre-definidas para agilizar o atendimento no WhatsApp."
                icon={<Zap className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Respostas Rapidas" },
                ]}
            />

            <QuickReplyManager initialReplies={quickReplies || []} />
        </div>
    );
}
