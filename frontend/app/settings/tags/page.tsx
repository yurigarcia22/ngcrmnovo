import { Tag } from "lucide-react";
import TagManager from "@/components/TagManager";
import { createClient } from "@/utils/supabase/server";

export default async function TagsSettingsPage() {
    const supabase = await createClient();
    const { data: tags } = await supabase
        .from("tags")
        .select("*, deal_tags(count)")
        .order("name", { ascending: true });

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Tag className="text-blue-600" />
                Etiquetas
            </h1>
            <p className="text-gray-500 mb-8">Gerencie as etiquetas para organizar seus leads.</p>

            <TagManager initialTags={tags || []} />
        </div>
    );
}
