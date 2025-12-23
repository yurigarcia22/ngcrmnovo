import { redirect } from "next/navigation";
import { getDealById, getTeamMembers, getNotes, getDealItems, getMessages } from "@/app/actions";
import { getProducts } from "@/app/(protected)/settings/products/actions";
import { getPipelines } from "@/app/(protected)/leads/actions";
import { getFields } from "@/app/(protected)/settings/fields/actions"; // Check path if errors occur

import DealInfoSidebar from "@/components/deal/DealInfoSidebar";
import DealTimeline from "@/components/deal/DealTimeline";
import DealHeader from "@/components/deal/DealHeader";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";

export default async function DealPage({ params }: { params: { id: string } }) {
    const { id } = await params;

    // Parallel Data Fetching
    const [
        dealRes,
        teamRes,
        pipeRes,
        notesRes,
        itemsRes,
        productsRes,
        fieldsRes,
        tagsRes,
        messagesRes
    ] = await Promise.all([
        getDealById(id),
        getTeamMembers(),
        getPipelines(),
        getNotes(id),
        getDealItems(id),
        getProducts(),
        getFields(),
        import("@/utils/supabase/server").then(mod => mod.createClient().then(client => client.from("tags").select("*").order("name"))),
        getMessages(id)
    ]);

    if (!dealRes.success || !dealRes.data) {
        return <div className="p-10 text-center">Negócio não encontrado.</div>;
    }

    const deal = dealRes.data;
    const teamMembers = teamRes.success ? teamRes.data : [];
    const pipelines = pipeRes.success ? pipeRes.data : [];
    const notes = notesRes.success ? notesRes.data : [];

    // Pass these if needed for editing logic later
    // const items = itemsRes.success ? itemsRes.data : [];
    // const products = productsRes.success ? productsRes.data : [];
    // const fields = fieldsRes.success ? fieldsRes.data : [];

    return (
        <div className="flex flex-col h-screen bg-[#f5f7f8] overflow-hidden">

            {/* GLOBAL HEADER */}
            <DealHeader deal={deal} pipelines={pipelines} />

            {/* MAIN CONTENT GRID */}
            <div className="flex-1 overflow-hidden grid grid-cols-12">

                {/* LEFT SIDEBAR (INFO) - span 4 (33%) */}
                <div className="col-span-12 md:col-span-4 lg:col-span-3 h-full overflow-hidden border-r border-gray-300 shadow-lg z-10">
                    <DealInfoSidebar
                        deal={deal}
                        teamMembers={teamMembers}
                        pipelines={pipelines}
                        availableTags={tagsRes.data || []}
                        products={productsRes.success ? productsRes.data : []}
                        dealItems={itemsRes.success ? itemsRes.data : []}
                    />
                </div>

                {/* RIGHT CONTENT (TIMELINE) - span 8 (66%) */}
                <div className="col-span-12 md:col-span-8 lg:col-span-9 h-full overflow-hidden bg-[#f0f2f5]">
                    <DealTimeline
                        dealId={deal.id}
                        initialNotes={notes}
                        initialMessages={messagesRes.success ? messagesRes.data : []}
                        contactPhone={deal.contacts?.phone}
                        contactId={deal.contacts?.id}
                    />
                </div>

            </div>
        </div>
    );
}
