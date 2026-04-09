import { Tag } from "lucide-react";
import TagManager from "@/components/TagManager";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/utils/supabase/server";

export default async function TagsSettingsPage() {
    const supabase = await createClient();
    const { data: tags } = await supabase
        .from("tags")
        .select("*, deal_tags(count)")
        .order("name", { ascending: true });

    return (
        <div className="max-w-6xl mx-auto">
            <PageHeader
                title="Etiquetas"
                description="Gerencie as etiquetas usadas para organizar seus leads e negocios."
                icon={<Tag className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Etiquetas" },
                ]}
            />

            <TagManager initialTags={tags || []} />
        </div>
    );
}
