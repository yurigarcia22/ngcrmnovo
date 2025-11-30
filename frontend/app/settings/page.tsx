import { createClient } from "@supabase/supabase-js";
import { Zap } from "lucide-react";
import QuickReplyManager from "../../components/QuickReplyManager";
import TagManager from "../../components/TagManager";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: quickReplies } = await supabase
        .from("quick_replies")
        .select("*")
        .order("category", { ascending: true });

    const { data: tags } = await supabase
        .from("tags")
        .select("*")
        .order("name", { ascending: true });

    return (
        <div className="flex-1 bg-[#0b141a] text-gray-100 p-8 overflow-y-auto h-screen">
            <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
                <div className="p-2 bg-blue-600 rounded-lg">
                    <Zap size={24} className="text-white" />
                </div>
                Configurações
            </h1>

            <TagManager initialTags={tags || []} />

            <div className="my-8 border-t border-gray-800" />

            <h2 className="text-xl font-bold text-white mb-4">Respostas Rápidas</h2>
            <QuickReplyManager initialReplies={quickReplies || []} />
        </div>
    );
}
