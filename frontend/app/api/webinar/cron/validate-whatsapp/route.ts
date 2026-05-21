/**
 * Cron de validação automática de WhatsApp.
 *
 * Pega leads sem whatsapp_validated_at, valida via Evolution batch,
 * marca os sem WhatsApp como lost('no_whatsapp_validated').
 *
 * Sugerido rodar a cada 5 min. Cada execução processa até 100 leads.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import {
  validateWhatsAppBatch,
  extractContactsFromWebsite,
} from "@/lib/webinar/whatsapp-validator";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  return runValidate();
}
export async function POST(_req: NextRequest) {
  return runValidate();
}

const BATCH_LIMIT = 100;

async function runValidate() {
  const supabase = createServiceClient();
  const startedAt = Date.now();
  try {
    // Pega leads sem whatsapp_validated_at, de TODAS campanhas active
    const { data: leads, error } = await supabase
      .from("webinar_campaign_leads")
      .select("id, phone, website, campaign_id")
      .is("whatsapp_validated_at", null)
      .neq("funnel_status", "lost")
      .order("created_at", { ascending: false })
      .limit(BATCH_LIMIT);
    if (error) throw error;
    if (!leads || leads.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        duration_ms: Date.now() - startedAt,
      });
    }

    // Enrichment via site (best-effort)
    const enrichedMap = new Map<string, string[]>();
    let site_enriched = 0;
    for (const lead of leads) {
      if (!lead.website) continue;
      try {
        const r = await extractContactsFromWebsite(lead.website);
        if (r.phones.length > 0) {
          enrichedMap.set(lead.id, r.phones);
          site_enriched += 1;
          await supabase
            .from("webinar_campaign_leads")
            .update({
              extra_phones: r.phones,
              site_enriched_at: new Date().toISOString(),
            })
            .eq("id", lead.id);
        } else {
          await supabase
            .from("webinar_campaign_leads")
            .update({ site_enriched_at: new Date().toISOString() })
            .eq("id", lead.id);
        }
      } catch {}
    }

    // Coleta números pra validar
    const toCheckList = leads.map((l: any) => {
      const set = new Set<string>();
      if (l.phone) set.add(String(l.phone).replace(/\D/g, ""));
      const extras = enrichedMap.get(l.id) ?? [];
      for (const e of extras) set.add(String(e).replace(/\D/g, ""));
      return { leadId: l.id, numbers: Array.from(set).filter(Boolean) };
    });

    const allNumbers = Array.from(
      new Set(toCheckList.flatMap((c) => c.numbers)),
    );
    const valRes = await validateWhatsAppBatch(allNumbers);

    const valMap = new Map<string, { exists: boolean; jid: string | null }>();
    for (const r of valRes.results) {
      valMap.set(String(r.number).replace(/\D/g, ""), {
        exists: r.exists,
        jid: r.jid,
      });
    }

    let com_whatsapp = 0;
    let sem_whatsapp = 0;
    const nowIso = new Date().toISOString();

    for (const item of toCheckList) {
      let firstValid: { number: string; jid: string | null } | null = null;
      for (const n of item.numbers) {
        const v = valMap.get(n);
        if (v?.exists) {
          firstValid = { number: n, jid: v.jid };
          break;
        }
      }
      if (firstValid) {
        com_whatsapp += 1;
        await supabase
          .from("webinar_campaign_leads")
          .update({
            whatsapp_validated_at: nowIso,
            whatsapp_valid: true,
            whatsapp_jid: firstValid.jid,
            phone: firstValid.number,
          })
          .eq("id", item.leadId);
      } else {
        sem_whatsapp += 1;
        await supabase
          .from("webinar_campaign_leads")
          .update({
            whatsapp_validated_at: nowIso,
            whatsapp_valid: false,
            whatsapp_jid: null,
            funnel_status: "lost",
            loss_reason: "no_whatsapp_validated",
            ai_paused: true,
          })
          .eq("id", item.leadId);
      }
    }

    return NextResponse.json({
      ok: true,
      processed: leads.length,
      com_whatsapp,
      sem_whatsapp,
      site_enriched,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error("[cron validate-whatsapp] erro", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "erro" },
      { status: 500 },
    );
  }
}
