import { listCampaigns, getDispatchInstances } from "./actions";
import DisparosClient from "./DisparosClient";

export const dynamic = "force-dynamic";

export default async function DisparosPage() {
    const [c, i] = await Promise.all([listCampaigns(), getDispatchInstances()]);
    return <DisparosClient initialCampaigns={c.campaigns || []} instances={i.instances || []} />;
}
