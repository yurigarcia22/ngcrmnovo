import { NextResponse } from "next/server";
import { authenticateApiKey, unauthorized, apiServiceClient } from "@/lib/api-auth";
import { normalizeToCanonical, getPossibleVariants } from "@/lib/phone";

export const dynamic = "force-dynamic";

// GET /api/v1/pets?search=&limit=  -> pets do tenant (com tutor)
export async function GET(req: Request) {
    const auth = await authenticateApiKey(req);
    if (!auth) return unauthorized();

    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

    const sb = apiServiceClient();
    let q = sb.from("pets")
        .select("id, name, species, breed, sex, birth_date, contact:contacts(id, name, phone)")
        .eq("tenant_id", auth.tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (search) q = q.ilike("name", `%${search}%`);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
}

// POST /api/v1/pets  body: { name, contactId? | tutorPhone?, species?, breed?, sex?, birthDate?, weightKg?, notes? }
// Liga o pet ao tutor por contactId ou por telefone (cria o tutor se nao existir).
export async function POST(req: Request) {
    const auth = await authenticateApiKey(req);
    if (!auth) return unauthorized();

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

    const name = (body?.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name (nome do pet) é obrigatório." }, { status: 400 });

    const sb = apiServiceClient();
    let contactId: string | null = body.contactId ?? null;

    // Valida contactId do tenant
    if (contactId) {
        const { data: c } = await sb.from("contacts").select("id").eq("id", contactId).eq("tenant_id", auth.tenantId).maybeSingle();
        if (!c) return NextResponse.json({ error: "contactId não encontrado neste tenant." }, { status: 404 });
    } else if (body.tutorPhone) {
        // Acha ou cria o tutor pelo telefone
        const variants = getPossibleVariants(String(body.tutorPhone));
        const { data: existing } = await sb.from("contacts").select("id").eq("tenant_id", auth.tenantId).in("phone", variants).limit(1).maybeSingle();
        if (existing) contactId = existing.id;
        else {
            const { data: newC, error: cErr } = await sb.from("contacts")
                .insert({ tenant_id: auth.tenantId, name: body.tutorName || "Tutor", phone: normalizeToCanonical(String(body.tutorPhone)) })
                .select("id").single();
            if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
            contactId = newC.id;
        }
    } else {
        return NextResponse.json({ error: "Informe contactId ou tutorPhone." }, { status: 400 });
    }

    const { data, error } = await sb
        .from("pets")
        .insert({
            tenant_id: auth.tenantId,
            contact_id: contactId,
            name,
            species: body.species || null,
            breed: body.breed || null,
            sex: body.sex || null,
            birth_date: body.birthDate || null,
            weight_kg: body.weightKg ?? null,
            notes: body.notes || null,
        })
        .select("id, name, species, breed, contact_id")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, created: true }, { status: 201 });
}
