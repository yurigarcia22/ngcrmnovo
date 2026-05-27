import { getMyTasks } from "@/app/actions";
import { MeuDiaClient } from "./MeuDiaClient";

export const dynamic = "force-dynamic";

type RawTask = {
    id: string;
    title?: string | null;
    description: string;
    due_date: string;
    is_completed: boolean;
    priority: "low" | "normal" | "high" | "urgent";
    is_recurring: boolean;
    recurrence_pattern: "daily" | "weekly" | "monthly" | null;
    completed_at: string | null;
    deal_id?: string | null;
    cold_lead_id?: string | null;
    deals?: any;
    cold_leads?: any;
};

function normalizeTask(t: RawTask) {
    const deal = Array.isArray(t.deals) ? t.deals[0] ?? null : t.deals ?? null;
    const coldLead = Array.isArray(t.cold_leads) ? t.cold_leads[0] ?? null : t.cold_leads ?? null;

    let dealNormalized = null;
    if (deal) {
        const contact = Array.isArray(deal.contacts) ? deal.contacts[0] ?? null : deal.contacts ?? null;
        dealNormalized = {
            id: deal.id,
            title: deal.title,
            contacts: contact,
        };
    }

    return {
        ...t,
        deals: dealNormalized,
        cold_leads: coldLead,
    };
}

function normalizeGroup(arr: RawTask[] | undefined) {
    return (arr ?? []).map(normalizeTask);
}

export default async function MeuDiaPage() {
    const res = await getMyTasks();
    const raw = (res.success && res.data)
        ? res.data
        : { overdue: [], today: [], upcoming: [], completedRecent: [] };

    const tasks = {
        overdue: normalizeGroup(raw.overdue),
        today: normalizeGroup(raw.today),
        upcoming: normalizeGroup(raw.upcoming),
        completedRecent: normalizeGroup(raw.completedRecent),
    };

    return <MeuDiaClient initialTasks={tasks} />;
}
