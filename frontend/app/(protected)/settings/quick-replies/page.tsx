import { createClient } from "@/utils/supabase/server";
import { Zap } from "lucide-react";
import QuickReplyManager from "@/components/QuickReplyManager";

export const dynamic = 'force-dynamic';

export default async function QuickRepliesPage() {
    const supabase = await createClient();

    const { data: quickReplies } = await supabase
        .from("quick_replies")
        .select("*")
        .order("category", { ascending: true });

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Zap className="text-yellow-500" />
                Respostas Rápidas
            </h1>
            <p className="text-gray-500 mb-8">Gerencie as mensagens pré-definidas para agilizar o atendimento.</p>

            <QuickReplyManager initialReplies={quickReplies || []} />
        </div>
    );
}
