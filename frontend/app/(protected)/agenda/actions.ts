"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";
import { isModuleEnabled } from "@/lib/modules";
import { revalidatePath } from "next/cache";

// Agenda de Atendimentos (vertical Clinica Veterinaria). O "atendimento" e o
// nucleo operacional da clinica: consulta/banho/vacina/retorno com dia, hora,
// profissional e status. Todas as actions sao tenant-scoped e exigem o modulo.

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

const DEFAULT_SERVICES = [
    { name: "Consulta", category: "consulta", price: 0, duration_min: 30 },
    { name: "Retorno", category: "retorno", price: 0, duration_min: 20 },
    { name: "Vacina V8", category: "vacina", price: 0, duration_min: 15 },
    { name: "Vacina V10", category: "vacina", price: 0, duration_min: 15 },
    { name: "Antirrábica", category: "vacina", price: 0, duration_min: 15 },
    { name: "Banho", category: "banho_tosa", price: 0, duration_min: 60 },
    { name: "Tosa", category: "banho_tosa", price: 0, duration_min: 60 },
    { name: "Banho e Tosa", category: "banho_tosa", price: 0, duration_min: 90 },
    { name: "Exame", category: "exame", price: 0, duration_min: 30 },
];

export interface AppointmentInput {
    petId?: string | null;
    contactId?: string | null;
    serviceId?: number | null;
    serviceName?: string;
    professionalId?: string | null;
    startsAt: string;          // ISO
    durationMin?: number;
    status?: string;
    price?: number;
    notes?: string;
}

// Atendimentos de um dia (00:00 a 23:59 local do servidor).
export async function getAppointmentsByDay(dateStr: string) {
    try {
        const tenantId = await getTenantId();
        const enabled = await isModuleEnabled(tenantId, "veterinaria");
        if (!enabled) return { success: true, enabled: false, appointments: [] as any[] };

        const start = `${dateStr}T00:00:00`;
        const end = `${dateStr}T23:59:59`;
        const supabase = svc();
        const { data, error } = await supabase
            .from("appointments")
            .select("*, pet:pets(id, name, species), contact:contacts(id, name, phone), professional:profiles(id, full_name)")
            .eq("tenant_id", tenantId)
            .gte("starts_at", start)
            .lte("starts_at", end)
            .order("starts_at", { ascending: true });
        if (error) throw error;
        return { success: true, enabled: true, appointments: data ?? [] };
    } catch (e: any) {
        return { success: false, enabled: true, appointments: [] as any[], error: e.message };
    }
}

// Contadores por status para um intervalo (usado nos KPIs da agenda).
export async function getAppointmentCountsByDay(dateStr: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();
        const { data } = await supabase
            .from("appointments")
            .select("status")
            .eq("tenant_id", tenantId)
            .gte("starts_at", `${dateStr}T00:00:00`)
            .lte("starts_at", `${dateStr}T23:59:59`);
        const counts: Record<string, number> = {};
        for (const r of data ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;
        return { success: true, counts, total: (data ?? []).length };
    } catch (e: any) {
        return { success: false, counts: {}, total: 0, error: e.message };
    }
}

export async function createAppointment(input: AppointmentInput) {
    try {
        const tenantId = await getTenantId();
        if (!(await isModuleEnabled(tenantId, "veterinaria")))
            throw new Error("Modulo Clinica Veterinaria desativado.");
        if (!input.startsAt) throw new Error("Informe a data e hora.");

        const supabase = svc();
        // Deriva o tutor a partir do pet, se nao veio.
        let contactId = input.contactId ?? null;
        if (!contactId && input.petId) {
            const { data: pet } = await supabase
                .from("pets").select("contact_id")
                .eq("id", input.petId).eq("tenant_id", tenantId).maybeSingle();
            contactId = pet?.contact_id ?? null;
        }

        const { data, error } = await supabase
            .from("appointments")
            .insert({
                tenant_id: tenantId,
                pet_id: input.petId ?? null,
                contact_id: contactId,
                service_id: input.serviceId ?? null,
                service_name: input.serviceName ?? null,
                professional_id: input.professionalId ?? null,
                starts_at: input.startsAt,
                duration_min: input.durationMin ?? 30,
                status: input.status ?? "agendado",
                price: input.price ?? 0,
                notes: input.notes ?? null,
            })
            .select("*, pet:pets(id, name, species), contact:contacts(id, name, phone), professional:profiles(id, full_name)")
            .single();
        if (error) throw error;
        revalidatePath("/agenda");
        return { success: true, appointment: data };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateAppointmentStatus(id: string, status: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();
        const { error } = await supabase
            .from("appointments")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", id).eq("tenant_id", tenantId);
        if (error) throw error;
        revalidatePath("/agenda");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteAppointment(id: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();
        const { error } = await supabase
            .from("appointments").delete()
            .eq("id", id).eq("tenant_id", tenantId);
        if (error) throw error;
        revalidatePath("/agenda");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Catalogo de servicos (cria os padroes na primeira vez).
export async function getServices() {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();
        let { data } = await supabase
            .from("vet_services").select("*")
            .eq("tenant_id", tenantId).eq("active", true)
            .order("id", { ascending: true });

        if (!data || data.length === 0) {
            await supabase.from("vet_services").insert(
                DEFAULT_SERVICES.map((s) => ({ ...s, tenant_id: tenantId }))
            );
            const reload = await supabase
                .from("vet_services").select("*")
                .eq("tenant_id", tenantId).eq("active", true)
                .order("id", { ascending: true });
            data = reload.data ?? [];
        }
        return { success: true, services: data ?? [] };
    } catch (e: any) {
        return { success: false, services: [] as any[], error: e.message };
    }
}

// Profissionais (equipe do tenant) para atribuir ao atendimento.
export async function getProfessionals() {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();
        const { data } = await supabase
            .from("profiles").select("id, full_name")
            .eq("tenant_id", tenantId)
            .order("full_name", { ascending: true });
        return { success: true, professionals: data ?? [] };
    } catch (e: any) {
        return { success: false, professionals: [] as any[], error: e.message };
    }
}

// Busca tutores (contatos) + seus pets para o modal de novo atendimento.
export async function searchTutorsWithPets(search: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();
        let query = supabase
            .from("contacts")
            .select("id, name, phone, pets(id, name, species)")
            .eq("tenant_id", tenantId)
            .limit(20);
        if (search?.trim()) query = query.ilike("name", `%${search.trim()}%`);
        const { data, error } = await query;
        if (error) throw error;
        return { success: true, tutors: data ?? [] };
    } catch (e: any) {
        return { success: false, tutors: [] as any[], error: e.message };
    }
}
