import { getInstances, getSafeProfiles, getSalesPipelines } from "./actions";
import WhatsAppSettingsClient from "./WhatsAppSettingsClient";

export const dynamic = "force-dynamic";

export default async function WhatsAppSettingsPage() {
    // 1. Buscar dados do servidor
    const instances = await getInstances();
    const teamMembers = await getSafeProfiles();
    const pipelines = await getSalesPipelines();

    // 2. Renderizar Client Component com os dados iniciais
    return (
        <WhatsAppSettingsClient
            initialInstances={instances}
            teamMembers={teamMembers}
            pipelines={pipelines}
        />
    );
}
