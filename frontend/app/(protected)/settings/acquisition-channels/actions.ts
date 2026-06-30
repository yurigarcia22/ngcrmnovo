"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getTenantId } from "@/app/actions";

function svc() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// Canais que todo tenant ja comeca com (pre-configurados).
const DEFAULT_CHANNELS = [
    { name: "Outbound", color: "#6366f1", position: 1 },
    { name: "Inbound", color: "#10b981", position: 2 },
    { name: "Indicação", color: "#f59e0b", position: 3 },
];

// Lista os canais do tenant. Se ainda nao tiver nenhum, semeia os 3 padrao.
export async function getAcquisitionChannels() {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();

        let { data, error } = await supabase
            .from("acquisition_channels")
            .select("*")
            .eq("tenant_id", tenantId)
            .order("position", { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            const seed = DEFAULT_CHANNELS.map((c) => ({ ...c, tenant_id: tenantId }));
            const { data: inserted, error: seedErr } = await supabase
                .from("acquisition_channels")
                .insert(seed)
                .select("*");
            // Se outra requisicao semeou em paralelo, relê em vez de quebrar.
            if (seedErr) {
                const { data: again } = await supabase
                    .from("acquisition_channels")
                    .select("*")
                    .eq("tenant_id", tenantId)
                    .order("position", { ascending: true });
                data = again ?? [];
            } else {
                data = (inserted ?? []).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
            }
        }

        return { success: true, data: data ?? [] };
    } catch (error: any) {
        return { success: false, error: error.message, data: [] };
    }
}

export async function createAcquisitionChannel(formData: FormData) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();

        const name = String(formData.get("name") || "").trim();
        const color = String(formData.get("color") || "#6366f1").trim();
        if (!name) throw new Error("Nome é obrigatório");

        const { data: maxPos } = await supabase
            .from("acquisition_channels")
            .select("position")
            .eq("tenant_id", tenantId)
            .order("position", { ascending: false })
            .limit(1)
            .maybeSingle();

        const position = (maxPos?.position || 0) + 1;

        const { error } = await supabase
            .from("acquisition_channels")
            .insert({ name, color, position, tenant_id: tenantId });

        if (error) throw error;

        revalidatePath("/settings/acquisition-channels");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateAcquisitionChannel(id: string, patch: { name?: string; color?: string }) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();

        const update: any = {};
        if (patch.name !== undefined) {
            if (!patch.name.trim()) throw new Error("Nome não pode ficar vazio");
            update.name = patch.name.trim();
        }
        if (patch.color !== undefined) update.color = patch.color;
        if (Object.keys(update).length === 0) return { success: true };

        const { error } = await supabase
            .from("acquisition_channels")
            .update(update)
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        revalidatePath("/settings/acquisition-channels");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteAcquisitionChannel(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();

        // FK em deals tem ON DELETE SET NULL: os negocios apenas ficam sem canal.
        const { error } = await supabase
            .from("acquisition_channels")
            .delete()
            .eq("id", id)
            .eq("tenant_id", tenantId);

        if (error) throw error;

        revalidatePath("/settings/acquisition-channels");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
