import { NextResponse } from "next/server";
import { authenticateApiKey, unauthorized, apiServiceClient } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// POST /api/v1/appointments  body: { startsAt(ISO), petId?, contactId?, serviceName?, durationMin?, status?, notes?, professionalId? }
// Cria um atendimento na agenda da clinica.
export async function POST(req: Request) {
    const auth = await authenticateApiKey(req);
    if (!auth) return unauthorized();

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

    const startsAt = (body?.startsAt ?? "").trim();
    if (!startsAt) return NextResponse.json({ error: "startsAt (data/hora ISO) é obrigatório." }, { status: 400 });

    const sb = apiServiceClient();

    // Deriva o tutor a partir do pet, se nao veio
    let contactId: string | null = body.contactId ?? null;
    if (body.petId) {
        const { data: pet } = await sb.from("pets").select("contact_id").eq("id", body.petId).eq("tenant_id", auth.tenantId).maybeSingle();
        if (!pet) return NextResponse.json({ error: "petId não encontrado neste tenant." }, { status: 404 });
        if (!contactId) contactId = pet.contact_id;
    }

    const { data, error } = await sb
        .from("appointments")
        .insert({
            tenant_id: auth.tenantId,
            pet_id: body.petId ?? null,
            contact_id: contactId,
            service_name: body.serviceName ?? null,
            professional_id: body.professionalId ?? null,
            starts_at: startsAt,
            duration_min: body.durationMin ?? 30,
            status: body.status ?? "agendado",
            notes: body.notes ?? null,
        })
        .select("id, starts_at, status, service_name, pet_id, contact_id")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, created: true }, { status: 201 });
}
