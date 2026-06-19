"use server";

import { createClient } from "@supabase/supabase-js";
import { getTenantId } from "@/app/actions";
import { isModuleEnabled } from "@/lib/modules";
import { revalidatePath } from "next/cache";

// Vertical Clinica Veterinaria — CRUD de pets (vinculados ao tutor=contact)
// e carteira de vacinas. Todas as actions sao tenant-scoped e exigem o
// modulo 'veterinaria' ligado para o tenant.

function svc() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export interface PetInput {
    contactId: string;
    name: string;
    species?: string;
    breed?: string;
    sex?: string;
    birthDate?: string | null;
    weightKg?: number | null;
    neutered?: boolean;
    color?: string;
    microchip?: string;
    notes?: string;
}

export interface VaccineInput {
    vaccineName: string;
    appliedAt?: string | null;
    nextDueAt?: string | null;
    veterinarian?: string;
    batch?: string;
    notes?: string;
}

// Mapeia o input do pet para colunas do banco (sem contactId/tenant).
function petFields(input: Partial<PetInput>) {
    const f: Record<string, any> = {};
    if (input.name !== undefined) f.name = input.name;
    if (input.species !== undefined) f.species = input.species || null;
    if (input.breed !== undefined) f.breed = input.breed || null;
    if (input.sex !== undefined) f.sex = input.sex || null;
    if (input.birthDate !== undefined) f.birth_date = input.birthDate || null;
    if (input.weightKg !== undefined) f.weight_kg = input.weightKg ?? null;
    if (input.neutered !== undefined) f.neutered = !!input.neutered;
    if (input.color !== undefined) f.color = input.color || null;
    if (input.microchip !== undefined) f.microchip = input.microchip || null;
    if (input.notes !== undefined) f.notes = input.notes || null;
    return f;
}

// Lista os pets de um tutor (contato) + carteira de vacinas.
// Retorna enabled=false (sem erro) quando o modulo esta desligado, para o
// painel do contato simplesmente nao renderizar a secao.
export async function getContactPets(contactId: string) {
    try {
        const tenantId = await getTenantId();
        const enabled = await isModuleEnabled(tenantId, "veterinaria");
        if (!enabled) return { success: true, enabled: false, pets: [] as any[] };

        const supabase = svc();
        const { data, error } = await supabase
            .from("pets")
            .select("*, vaccines:pet_vaccines(*)")
            .eq("tenant_id", tenantId)
            .eq("contact_id", contactId)
            .order("created_at", { ascending: true });
        if (error) throw error;

        const pets = (data ?? []).map((p: any) => ({
            ...p,
            vaccines: (p.vaccines ?? [])
                .slice()
                .sort((a: any, b: any) =>
                    String(b.next_due_at || b.applied_at || "").localeCompare(
                        String(a.next_due_at || a.applied_at || "")
                    )
                ),
        }));
        return { success: true, enabled: true, pets };
    } catch (e: any) {
        return { success: false, enabled: true, pets: [] as any[], error: e.message };
    }
}

export async function createPet(input: PetInput) {
    try {
        const tenantId = await getTenantId();
        if (!(await isModuleEnabled(tenantId, "veterinaria")))
            throw new Error("Modulo Clinica Veterinaria desativado.");
        if (!input.name?.trim()) throw new Error("Nome do pet e obrigatorio.");

        const supabase = svc();
        // Garante que o tutor pertence ao tenant.
        const { data: c } = await supabase
            .from("contacts").select("id")
            .eq("id", input.contactId).eq("tenant_id", tenantId).maybeSingle();
        if (!c) throw new Error("Tutor (contato) nao encontrado.");

        const { data, error } = await supabase
            .from("pets")
            .insert({ tenant_id: tenantId, contact_id: input.contactId, ...petFields(input) })
            .select("*, vaccines:pet_vaccines(*)")
            .single();
        if (error) throw error;
        revalidatePath("/pets");
        return { success: true, pet: { ...data, vaccines: data.vaccines ?? [] } };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updatePet(petId: string, patch: Partial<PetInput>) {
    try {
        const tenantId = await getTenantId();
        if (!(await isModuleEnabled(tenantId, "veterinaria")))
            throw new Error("Modulo Clinica Veterinaria desativado.");
        const supabase = svc();
        const { error } = await supabase
            .from("pets")
            .update({ ...petFields(patch), updated_at: new Date().toISOString() })
            .eq("id", petId)
            .eq("tenant_id", tenantId);
        if (error) throw error;
        revalidatePath("/pets");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deletePet(petId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();
        const { error } = await supabase
            .from("pets").delete()
            .eq("id", petId).eq("tenant_id", tenantId);
        if (error) throw error;
        revalidatePath("/pets");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function addVaccine(petId: string, input: VaccineInput) {
    try {
        const tenantId = await getTenantId();
        if (!(await isModuleEnabled(tenantId, "veterinaria")))
            throw new Error("Modulo Clinica Veterinaria desativado.");
        if (!input.vaccineName?.trim()) throw new Error("Nome da vacina e obrigatorio.");

        const supabase = svc();
        // Confirma que o pet pertence ao tenant.
        const { data: pet } = await supabase
            .from("pets").select("id")
            .eq("id", petId).eq("tenant_id", tenantId).maybeSingle();
        if (!pet) throw new Error("Pet nao encontrado.");

        const { data, error } = await supabase
            .from("pet_vaccines")
            .insert({
                tenant_id: tenantId,
                pet_id: petId,
                vaccine_name: input.vaccineName,
                applied_at: input.appliedAt || null,
                next_due_at: input.nextDueAt || null,
                veterinarian: input.veterinarian || null,
                batch: input.batch || null,
                notes: input.notes || null,
            })
            .select()
            .single();
        if (error) throw error;
        return { success: true, vaccine: data };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteVaccine(vaccineId: string) {
    try {
        const tenantId = await getTenantId();
        const supabase = svc();
        const { error } = await supabase
            .from("pet_vaccines").delete()
            .eq("id", vaccineId).eq("tenant_id", tenantId);
        if (error) throw error;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Prontuario completo de um pet: dados + tutor + vacinas + historico de atendimentos.
export async function getPetProfile(petId: string) {
    try {
        const tenantId = await getTenantId();
        const enabled = await isModuleEnabled(tenantId, "veterinaria");
        if (!enabled) return { success: false, enabled: false, error: "Modulo desativado." };

        const supabase = svc();
        const { data: pet, error } = await supabase
            .from("pets")
            .select("*, contact:contacts(id, name, phone, email), vaccines:pet_vaccines(*)")
            .eq("id", petId)
            .eq("tenant_id", tenantId)
            .maybeSingle();
        if (error) throw error;
        if (!pet) return { success: false, enabled: true, error: "Pet nao encontrado." };

        const { data: appointments } = await supabase
            .from("appointments")
            .select("id, service_name, starts_at, status, notes, professional:profiles(full_name)")
            .eq("pet_id", petId)
            .eq("tenant_id", tenantId)
            .order("starts_at", { ascending: false })
            .limit(100);

        const vaccines = (pet.vaccines ?? []).slice().sort((a: any, b: any) =>
            String(b.next_due_at || b.applied_at || "").localeCompare(String(a.next_due_at || a.applied_at || ""))
        );

        return { success: true, enabled: true, pet: { ...pet, vaccines }, appointments: appointments ?? [] };
    } catch (e: any) {
        return { success: false, enabled: true, error: e.message };
    }
}

// Lista geral de pets da clinica (pagina /pets), com tutor e proxima vacina.
export async function getAllPets(search?: string) {
    try {
        const tenantId = await getTenantId();
        const enabled = await isModuleEnabled(tenantId, "veterinaria");
        if (!enabled) return { success: true, enabled: false, pets: [] as any[] };

        const supabase = svc();
        let query = supabase
            .from("pets")
            .select("*, contact:contacts(id, name, phone), vaccines:pet_vaccines(id, vaccine_name, next_due_at)")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(500);
        if (search?.trim()) query = query.ilike("name", `%${search.trim()}%`);

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, enabled: true, pets: data ?? [] };
    } catch (e: any) {
        return { success: false, enabled: true, pets: [] as any[], error: e.message };
    }
}
