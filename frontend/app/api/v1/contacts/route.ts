import { NextResponse } from "next/server";
import { authenticateApiKey, unauthorized, apiServiceClient } from "@/lib/api-auth";
import { normalizeToCanonical, getPossibleVariants } from "@/lib/phone";

export const dynamic = "force-dynamic";

// GET /api/v1/contacts?search=&limit=  -> lista contatos (tutores) do tenant
export async function GET(req: Request) {
    const auth = await authenticateApiKey(req);
    if (!auth) return unauthorized();

    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

    const sb = apiServiceClient();
    let q = sb.from("contacts")
        .select("id, name, phone, email, notes, created_at")
        .eq("tenant_id", auth.tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (search) q = q.ilike("name", `%${search}%`);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
}

// POST /api/v1/contacts  body: { name, phone, email?, notes? }
// Upsert por telefone (dedup): se ja existe, atualiza nome/email; senao cria.
export async function POST(req: Request) {
    const auth = await authenticateApiKey(req);
    if (!auth) return unauthorized();

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

    const name = (body?.name ?? "").trim();
    const rawPhone = (body?.phone ?? "").trim();
    if (!name && !rawPhone) return NextResponse.json({ error: "Informe pelo menos name ou phone." }, { status: 400 });

    const sb = apiServiceClient();
    const phone = rawPhone ? normalizeToCanonical(rawPhone) : null;

    // Dedup por telefone (variantes com/sem 9, com/sem 55).
    if (phone) {
        const variants = getPossibleVariants(rawPhone);
        const { data: existing } = await sb
            .from("contacts")
            .select("id, name, phone, email")
            .eq("tenant_id", auth.tenantId)
            .in("phone", variants)
            .limit(1)
            .maybeSingle();

        if (existing) {
            const patch: any = {};
            if (name && name !== existing.name) patch.name = name;
            if (body.email !== undefined) patch.email = body.email || null;
            if (body.notes !== undefined) patch.notes = body.notes || null;
            if (Object.keys(patch).length) {
                await sb.from("contacts").update(patch).eq("id", existing.id).eq("tenant_id", auth.tenantId);
            }
            return NextResponse.json({ data: { ...existing, ...patch }, created: false });
        }
    }

    const { data, error } = await sb
        .from("contacts")
        .insert({
            tenant_id: auth.tenantId,
            name: name || "Sem nome",
            phone,
            email: body.email || null,
            notes: body.notes || null,
        })
        .select("id, name, phone, email, notes, created_at")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data, created: true }, { status: 201 });
}
