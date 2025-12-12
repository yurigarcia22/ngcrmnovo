import { getInstances, getSafeProfiles } from "./actions";
import WhatsAppSettingsClient from "./WhatsAppSettingsClient";

export default async function WhatsAppSettingsPage() {
    // 1. Buscar dados do servidor
    const instances = await getInstances();
    const teamMembers = await getSafeProfiles();

    // 2. Renderizar Client Component com os dados iniciais
    return (
        <WhatsAppSettingsClient
            initialInstances={instances}
            teamMembers={teamMembers}
        />
    );
}
