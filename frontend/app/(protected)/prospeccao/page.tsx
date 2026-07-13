import { listLeads } from "./actions";
import ProspeccaoClient from "./ProspeccaoClient";

export const dynamic = "force-dynamic";

export default async function ProspeccaoPage() {
    const res = await listLeads();
    return <ProspeccaoClient initialLeads={res.leads || []} />;
}
