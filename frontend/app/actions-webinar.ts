"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type {
  WebinarCampaign,
  WebinarCampaignInput,
  WebinarCampaignLead,
  WebinarCadenceStep,
  WebinarStatus,
} from "@/types/webinar";
import {
  pickInitialGreeting,
  renderTemplate,
} from "@/lib/webinar/cadences";
import { pickInstance, sendTextViaEvolution } from "@/lib/webinar/evolution";
import {
  startScrape,
  getScrapeJob,
  normalizeBrazilianPhone,
} from "@/lib/webinar/scraper";

async function getTenantId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  return profile?.tenant_id ?? null;
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<{
  success: boolean;
  data?: WebinarCampaign[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: campaigns, error } = await supabase
      .from("webinar_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!campaigns || campaigns.length === 0) return { success: true, data: [] };

    // Contagem dinâmica de leads por status (fonte de verdade)
    const ids = (campaigns as any[]).map((c) => c.id);
    const { data: leads } = await supabase
      .from("webinar_campaign_leads")
      .select("campaign_id, funnel_status")
      .in("campaign_id", ids);

    const counts = new Map<string, Record<string, number>>();
    for (const id of ids) counts.set(id, {});
    for (const l of (leads as any[]) ?? []) {
      const map = counts.get(l.campaign_id) ?? {};
      map[l.funnel_status] = (map[l.funnel_status] ?? 0) + 1;
      counts.set(l.campaign_id, map);
    }

    const enriched = (campaigns as any[]).map((c) => {
      const m = counts.get(c.id) ?? {};
      const total = Object.values(m).reduce((a: number, b: any) => a + (b as number), 0);
      const invited =
        (m.invited ?? 0) +
        (m.pending_response ?? 0) +
        (m.qualifying ?? 0) +
        (m.pitched ?? 0) +
        (m.collecting_info ?? 0) +
        (m.replied ?? 0) +
        (m.confirmed ?? 0) +
        (m.attended ?? 0) +
        (m.no_show ?? 0) +
        (m.converted ?? 0) +
        (m.interested_future ?? 0);
      const confirmed = (m.confirmed ?? 0) + (m.attended ?? 0) + (m.converted ?? 0);
      const attended = (m.attended ?? 0) + (m.converted ?? 0);
      const converted = m.converted ?? 0;
      return {
        ...c,
        total_leads: total,
        total_invited: invited,
        total_confirmed: confirmed,
        total_attended: attended,
        total_converted: converted,
      };
    });

    return { success: true, data: enriched as WebinarCampaign[] };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

export async function getCampaign(id: string): Promise<{
  success: boolean;
  data?: WebinarCampaign;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("webinar_campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // Contagem dinâmica de leads por status
    const { data: leads } = await supabase
      .from("webinar_campaign_leads")
      .select("funnel_status")
      .eq("campaign_id", id);

    const m: Record<string, number> = {};
    for (const l of (leads as any[]) ?? []) {
      m[l.funnel_status] = (m[l.funnel_status] ?? 0) + 1;
    }

    const total = Object.values(m).reduce((a, b) => a + b, 0);
    const invited =
      (m.invited ?? 0) +
      (m.pending_response ?? 0) +
      (m.qualifying ?? 0) +
      (m.pitched ?? 0) +
      (m.collecting_info ?? 0) +
      (m.replied ?? 0) +
      (m.confirmed ?? 0) +
      (m.attended ?? 0) +
      (m.no_show ?? 0) +
      (m.converted ?? 0) +
      (m.interested_future ?? 0);
    const confirmed = (m.confirmed ?? 0) + (m.attended ?? 0) + (m.converted ?? 0);
    const attended = (m.attended ?? 0) + (m.converted ?? 0);
    const converted = m.converted ?? 0;

    return {
      success: true,
      data: {
        ...(data as any),
        total_leads: total,
        total_invited: invited,
        total_confirmed: confirmed,
        total_attended: attended,
        total_converted: converted,
      } as WebinarCampaign,
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

export async function createCampaign(input: WebinarCampaignInput): Promise<{
  success: boolean;
  data?: WebinarCampaign;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) {
      return { success: false, error: "Sem tenant" };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("webinar_campaigns")
      .insert({
        tenant_id: tenantId,
        owner_id: user?.id ?? null,
        name: input.name,
        theme: input.theme ?? null,
        description: input.description ?? null,
        event_date: input.event_date ?? null,
        meet_link: input.meet_link ?? null,
        offer_description: input.offer_description ?? null,
        cal_link: input.cal_link ?? null,
        instance_name: input.instance_name ?? null,
        target_nicho: input.target_nicho ?? null,
        target_cities: input.target_cities ?? null,
        status: "draft",
      })
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/webinar");
    return { success: true, data: data as WebinarCampaign };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

export async function updateCampaign(
  id: string,
  input: Partial<WebinarCampaignInput> & { status?: WebinarStatus },
): Promise<{ success: boolean; data?: WebinarCampaign; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("webinar_campaigns")
      .update(input)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/webinar");
    revalidatePath(`/webinar/${id}`);
    return { success: true, data: data as WebinarCampaign };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

export async function deleteCampaign(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("webinar_campaigns")
      .delete()
      .eq("id", id);

    if (error) throw error;
    revalidatePath("/webinar");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export async function listCampaignLeads(campaignId: string): Promise<{
  success: boolean;
  data?: WebinarCampaignLead[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("webinar_campaign_leads")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: data as WebinarCampaignLead[] };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

/**
 * Lista leads que já passaram da etapa de qualificação.
 * Filter aceita: 'confirmed' | 'attended' | 'no_show' | 'converted' | 'all'
 */
export async function listConfirmedLeads(
  campaignId: string,
  filter: "confirmed" | "attended" | "no_show" | "converted" | "all" = "all",
): Promise<{
  success: boolean;
  data?: WebinarCampaignLead[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const allConfirmedStatuses: string[] = [
      "confirmed",
      "attended",
      "no_show",
      "converted",
    ];
    const statuses = filter === "all" ? allConfirmedStatuses : [filter];

    const { data, error } = await supabase
      .from("webinar_campaign_leads")
      .select("*")
      .eq("campaign_id", campaignId)
      .in("funnel_status", statuses)
      .order("last_interaction_at", { ascending: false, nullsFirst: false });

    if (error) throw error;
    return { success: true, data: data as WebinarCampaignLead[] };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

/**
 * Exporta confirmados como CSV (string).
 * Header: empresa, nome, email, telefone_direto, telefone_original, status, data_confirmacao
 */
export async function exportConfirmedLeadsCSV(campaignId: string): Promise<{
  success: boolean;
  csv?: string;
  filename?: string;
  error?: string;
}> {
  try {
    const result = await listConfirmedLeads(campaignId, "all");
    if (!result.success || !result.data) {
      throw new Error(result.error ?? "Falha ao listar");
    }

    const escape = (s: string | null | undefined): string => {
      if (s === null || s === undefined) return "";
      const str = String(s);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replaceAll('"', '""')}"`;
      }
      return str;
    };

    const header = [
      "empresa",
      "responsavel",
      "email",
      "telefone_direto",
      "telefone_whatsapp",
      "status",
      "data_confirmacao",
      "instance_usada",
    ].join(",");

    const rows = result.data.map((l) =>
      [
        escape(l.company_name),
        escape(l.responsible_name),
        escape(l.responsible_email),
        escape(l.responsible_direct_phone),
        escape(l.phone),
        escape(l.funnel_status),
        escape(l.last_interaction_at),
        escape(l.last_instance_used),
      ].join(","),
    );

    const csv = [header, ...rows].join("\n");
    const filename = `confirmados-${campaignId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
    return { success: true, csv, filename };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

/**
 * Envia um lead confirmado pro CRM principal (cria contact + deal no Funil de Vendas).
 *
 * Modos:
 * - "lead":    primeiro stage do funil (entrada normal)
 * - "meeting": stage com nome ~"Reunião"
 * - "sale":    stage "Ganho" (venda fechada)
 *
 * Também marca o webinar lead com crm_deal_id pra impedir duplicação,
 * e atualiza funnel_status quando aplicável (meeting -> attended, sale -> converted).
 */
export async function pushConfirmedLeadToCrm(
  webinarLeadId: string,
  mode: "lead" | "meeting" | "sale",
): Promise<{ success: boolean; deal_id?: string; error?: string }> {
  try {
    const supabase = await createClient();
    const tenantId = await getTenantId();
    if (!tenantId) return { success: false, error: "Sem tenant" };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Sem auth" };

    // 1. Carrega lead + campaign
    const { data: lead, error: leadErr } = await supabase
      .from("webinar_campaign_leads")
      .select("*, webinar_campaigns(theme, name)")
      .eq("id", webinarLeadId)
      .single();
    if (leadErr || !lead) {
      return { success: false, error: leadErr?.message ?? "Lead não encontrado" };
    }
    if ((lead as any).crm_deal_id) {
      return {
        success: false,
        error: "Esse lead já foi enviado pro CRM antes",
      };
    }

    const campaign = (lead as any).webinar_campaigns;
    const contactName =
      lead.responsible_name ?? lead.company_name ?? lead.phone;
    const contactPhone = lead.responsible_direct_phone ?? lead.phone;
    const contactEmail = lead.responsible_email ?? null;

    // 2. Upsert contact (procura por telefone primeiro)
    const possiblePhones = [contactPhone];
    if (contactPhone.startsWith("55") && contactPhone.length >= 12) {
      possiblePhones.push(contactPhone.substring(2));
    }
    if (lead.phone !== contactPhone) possiblePhones.push(lead.phone);

    let contactId: string | null = null;
    const { data: existingContacts } = await supabase
      .from("contacts")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("phone", possiblePhones)
      .limit(1);

    if (existingContacts && existingContacts.length > 0) {
      contactId = existingContacts[0].id;
    } else {
      const insertContact: any = {
        tenant_id: tenantId,
        name: contactName,
        phone: contactPhone,
      };
      if (contactEmail) insertContact.email = contactEmail;
      const { data: newContact, error: cErr } = await supabase
        .from("contacts")
        .insert(insertContact)
        .select("id")
        .single();
      if (cErr || !newContact) {
        return { success: false, error: `Contact: ${cErr?.message}` };
      }
      contactId = newContact.id;
    }

    // 3. Pipeline alvo (Funil de Vendas)
    let pipelineId: string | null = null;
    const { data: pipeFunil } = await supabase
      .from("pipelines")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", "%Funil de Vendas%")
      .limit(1);
    if (pipeFunil && pipeFunil.length > 0) {
      pipelineId = pipeFunil[0].id;
    } else {
      const { data: firstPipe } = await supabase
        .from("pipelines")
        .select("id")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      if (firstPipe) pipelineId = firstPipe.id;
    }
    if (!pipelineId) {
      return {
        success: false,
        error: "Nenhum pipeline configurado no CRM. Cria um em Configurações > Funis.",
      };
    }

    // 4. Stage alvo conforme modo
    const { data: stages } = await supabase
      .from("stages")
      .select("id, name, position")
      .eq("tenant_id", tenantId)
      .eq("pipeline_id", pipelineId)
      .order("position", { ascending: true });

    if (!stages || stages.length === 0) {
      return { success: false, error: "Pipeline sem stages" };
    }

    const findStage = (regex: RegExp) =>
      stages.find((s: any) => regex.test(s.name?.toLowerCase() ?? ""));

    let stageId: string | null = null;
    if (mode === "lead") {
      stageId = stages[0].id;
    } else if (mode === "meeting") {
      stageId = (findStage(/reuni/) ?? stages[1] ?? stages[0]).id;
    } else if (mode === "sale") {
      stageId = (findStage(/ganh|venda|fechad/) ?? stages[stages.length - 1]).id;
    }
    if (!stageId) {
      return { success: false, error: "Stage alvo não encontrado" };
    }

    // 5. Cria deal
    const tema = campaign?.theme ?? campaign?.name ?? "Webinar";
    const dealTitle = `${contactName} (Webinar: ${tema})`;
    const dealStatus =
      mode === "sale" ? "won" : mode === "meeting" ? "open" : "open";

    const { data: newDeal, error: dealErr } = await supabase
      .from("deals")
      .insert({
        title: dealTitle,
        value: 0,
        contact_id: contactId,
        stage_id: stageId,
        status: dealStatus,
        tenant_id: tenantId,
        owner_id: user.id,
      })
      .select("id")
      .single();

    if (dealErr || !newDeal) {
      return { success: false, error: `Deal: ${dealErr?.message}` };
    }

    // 6. Atualiza webinar lead com referência + funnel_status apropriado
    const updates: any = {
      crm_deal_id: newDeal.id,
      crm_pushed_at: new Date().toISOString(),
      crm_pushed_mode: mode,
    };
    if (mode === "meeting" && lead.funnel_status === "confirmed") {
      updates.funnel_status = "attended";
    }
    if (mode === "sale") {
      updates.funnel_status = "converted";
    }

    await supabase
      .from("webinar_campaign_leads")
      .update(updates)
      .eq("id", webinarLeadId);

    revalidatePath(`/webinar/${lead.campaign_id}`);
    return { success: true, deal_id: newDeal.id };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

// ─── Scraping (Google Maps via ng-scraper-google) ────────────────────────────

/**
 * Dispara um job de scraping no ng-scraper-google.
 * Usa target_nicho + target_cities da campanha.
 * Salva o job_id pra poder pollar depois.
 */
export async function startCampaignScraping(
  campaignId: string,
  maxPerCity = 100,
): Promise<{ success: boolean; job_id?: string; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: campaign, error: cErr } = await supabase
      .from("webinar_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (cErr || !campaign) {
      return { success: false, error: cErr?.message ?? "Campanha não encontrada" };
    }

    if (!campaign.target_nicho) {
      return {
        success: false,
        error: "Define o nicho (target_nicho) na aba Setup antes de buscar leads",
      };
    }
    if (!campaign.target_cities || campaign.target_cities.length === 0) {
      return {
        success: false,
        error: "Adiciona pelo menos uma cidade na aba Setup",
      };
    }
    if (campaign.scraping_job_id) {
      // Tem um job já. Só permite re-disparar se o anterior já tá done/error.
      const cur = await getScrapeJob(campaign.scraping_job_id);
      if (
        cur.ok &&
        cur.job?.status &&
        (cur.job.status === "queued" || cur.job.status === "running")
      ) {
        return {
          success: false,
          error: "Já tem um scraping rodando pra essa campanha. Aguarda terminar.",
        };
      }
    }

    const r = await startScrape({
      nicho: campaign.target_nicho,
      cidades: campaign.target_cities,
      max_per_city: maxPerCity,
    });
    if (!r.ok || !r.job_id) {
      return { success: false, error: r.error ?? "Falha ao chamar scraper" };
    }

    await supabase
      .from("webinar_campaigns")
      .update({
        scraping_job_id: r.job_id,
        scraping_started_at: new Date().toISOString(),
        scraping_finished_at: null,
        scraping_max_per_city: maxPerCity,
        scraping_error: null,
        status: "scraping",
      })
      .eq("id", campaignId);

    revalidatePath(`/webinar/${campaignId}`);
    return { success: true, job_id: r.job_id };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

/**
 * Verifica o status do job de scraping da campanha.
 * Quando o job tá `done`, insere os leads coletados em webinar_campaign_leads
 * (deduplicando por phone) e marca campanha como `ready`.
 *
 * Retorna o estado atual pra UI mostrar progresso.
 */
export async function pollCampaignScraping(campaignId: string): Promise<{
  success: boolean;
  status?: "idle" | "queued" | "running" | "done" | "error";
  inserted?: number;
  total?: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: campaign, error: cErr } = await supabase
      .from("webinar_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (cErr || !campaign) {
      return { success: false, error: cErr?.message ?? "Campanha não encontrada" };
    }

    if (!campaign.scraping_job_id) {
      return { success: true, status: "idle" };
    }

    // Se já foi finalizado antes, só retorna o estado salvo
    if (campaign.scraping_finished_at) {
      return {
        success: true,
        status: campaign.scraping_error ? "error" : "done",
        error: campaign.scraping_error ?? undefined,
      };
    }

    const r = await getScrapeJob(campaign.scraping_job_id);
    if (!r.ok || !r.job) {
      return { success: false, error: r.error ?? "Job não encontrado no scraper" };
    }

    if (r.job.status === "queued" || r.job.status === "running") {
      return { success: true, status: r.job.status };
    }

    if (r.job.status === "error") {
      await supabase
        .from("webinar_campaigns")
        .update({
          scraping_finished_at: new Date().toISOString(),
          scraping_error: r.job.error ?? "erro desconhecido",
          status: "draft",
        })
        .eq("id", campaignId);
      return {
        success: true,
        status: "error",
        error: r.job.error ?? "erro desconhecido",
      };
    }

    // status === "done" — insere leads
    const companies = r.job.result?.companies ?? [];
    let inserted = 0;

    if (companies.length > 0) {
      // Pega telefones já existentes pra deduplicar
      const { data: existingLeads } = await supabase
        .from("webinar_campaign_leads")
        .select("phone")
        .eq("campaign_id", campaignId);
      const existingPhones = new Set(
        (existingLeads ?? []).map((l: any) => l.phone),
      );

      const rows = companies
        .map((c) => {
          const phone = normalizeBrazilianPhone(c.phone ?? null);
          if (!phone) return null;
          if (existingPhones.has(phone)) return null;
          existingPhones.add(phone);
          return {
            campaign_id: campaignId,
            phone,
            company_name: c.title ?? null,
            website: c.website ?? null,
            address: c.address ?? null,
            rating: c.totalScore ?? null,
            reviews_count: c.reviewsCount ?? 0,
            funnel_status: "scraped" as const,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("webinar_campaign_leads")
          .insert(rows);
        if (insErr) {
          await supabase
            .from("webinar_campaigns")
            .update({
              scraping_finished_at: new Date().toISOString(),
              scraping_error: `Erro ao inserir leads: ${insErr.message}`,
              status: "draft",
            })
            .eq("id", campaignId);
          return { success: false, error: insErr.message };
        }
        inserted = rows.length;
      }
    }

    await supabase
      .from("webinar_campaigns")
      .update({
        scraping_finished_at: new Date().toISOString(),
        scraping_error: null,
        status: "ready",
      })
      .eq("id", campaignId);

    revalidatePath(`/webinar/${campaignId}`);
    return {
      success: true,
      status: "done",
      inserted,
      total: companies.length,
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

export async function addLeadManually(
  campaignId: string,
  input: { phone: string; company_name?: string; website?: string; address?: string },
): Promise<{ success: boolean; data?: WebinarCampaignLead; error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("webinar_campaign_leads")
      .insert({
        campaign_id: campaignId,
        phone: input.phone,
        company_name: input.company_name ?? null,
        website: input.website ?? null,
        address: input.address ?? null,
        funnel_status: "scraped",
      })
      .select()
      .single();

    if (error) throw error;
    revalidatePath(`/webinar/${campaignId}`);
    return { success: true, data: data as WebinarCampaignLead };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

// ─── Test message dispatch ───────────────────────────────────────────────────

function renderInviteMessage(lead: any, campaign: any): string {
  const empresa = lead.company_name ? `time da ${lead.company_name}` : "tudo bem?";
  const tema = campaign.theme ?? "um webinar exclusivo";
  const date = campaign.event_date
    ? new Date(campaign.event_date).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "em breve (data será confirmada)";
  const link = campaign.meet_link ?? "(link será enviado em breve)";
  const oferta = campaign.offer_description
    ? `\n\nApós o evento: ${campaign.offer_description}`
    : "";

  return `Oi, ${empresa}\n\nVou rodar um webinar: "${tema}".\n\nData: ${date}\nLink: ${link}${oferta}\n\nConfirma sua presença?`;
}

export async function sendTestMessageToLead(leadId: string): Promise<{
  success: boolean;
  error?: string;
  sentText?: string;
}> {
  try {
    const supabase = await createClient();

    const { data: lead, error: leadErr } = await supabase
      .from("webinar_campaign_leads")
      .select("*, webinar_campaigns(*)")
      .eq("id", leadId)
      .single();

    if (leadErr) throw leadErr;
    if (!lead) throw new Error("Lead não encontrado");

    const campaign = (lead as any).webinar_campaigns;
    if (!campaign) throw new Error("Campanha não encontrada");
    if (!campaign.instance_name) {
      throw new Error("Configura uma instance Evolution na aba Setup primeiro");
    }

    const message = renderInviteMessage(lead, campaign);

    const instance = await pickInstance({
      instance_names: campaign.instance_names,
      instance_name: campaign.instance_name,
    });
    if (!instance) {
      throw new Error(
        "Nenhuma instance Evolution disponível. Configura na aba Setup.",
      );
    }

    const evoResult = await sendTextViaEvolution(instance, lead.phone, message);
    if (!evoResult.ok) throw new Error(evoResult.error ?? "Evolution falhou");

    await supabase
      .from("webinar_campaign_leads")
      .update({ funnel_status: "invited" })
      .eq("id", leadId);

    await supabase.from("webinar_messages").insert({
      campaign_lead_id: leadId,
      scheduled_at: new Date().toISOString(),
      status: "sent",
      direction: "outbound",
      sent_text: message,
      sent_at: new Date().toISOString(),
      evolution_message_id: evoResult.messageId ?? null,
      instance_used: instance,
    });

    await supabase
      .from("webinar_campaigns")
      .update({ total_invited: (campaign.total_invited ?? 0) + 1 })
      .eq("id", campaign.id);

    revalidatePath(`/webinar/${campaign.id}`);
    return { success: true, sentText: message };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

// ─── Start campaign (Fase 1 conversacional) ──────────────────────────────────
//
// Cria UMA mensagem inicial pendente por lead (saudação variada, anti-ban).
// O agente Gemini conduz toda a conversa daí em diante via webhook, e quando
// coleta os dados do responsável (collect_responsible_info), agenda
// automaticamente a Fase 2 (cadência de lembretes adaptativa).

export async function startCampaign(campaignId: string): Promise<{
  success: boolean;
  scheduled?: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const { data: campaign, error: cErr } = await supabase
      .from("webinar_campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();
    if (cErr) throw cErr;
    if (!campaign) throw new Error("Campanha não encontrada");

    if (!campaign.event_date) {
      throw new Error(
        "Define event_date na aba Setup antes de iniciar a campanha",
      );
    }
    if (!campaign.theme) {
      throw new Error("Define theme na aba Setup antes de iniciar");
    }
    const hasInstance =
      (Array.isArray(campaign.instance_names) &&
        campaign.instance_names.length > 0) ||
      (campaign.instance_name && campaign.instance_name.trim());
    if (!hasInstance) {
      throw new Error(
        "Configura ao menos uma Instance Evolution na aba Setup",
      );
    }

    const { data: leads, error: lErr } = await supabase
      .from("webinar_campaign_leads")
      .select("id, phone, funnel_status")
      .eq("campaign_id", campaignId)
      .in("funnel_status", ["scraped", "enriched"]);
    if (lErr) throw lErr;
    if (!leads || leads.length === 0) {
      throw new Error(
        "Nenhum lead apto pra abordagem inicial (status scraped/enriched)",
      );
    }

    // Cria UMA mensagem inicial pendente por lead.
    // scheduled_at = agora (cron pega no próximo tick e dispara com jitter de 3 a 7 min)
    const now = new Date();
    const rowsToInsert = leads.map((lead) => ({
      campaign_lead_id: lead.id,
      scheduled_at: now.toISOString(),
      status: "pending",
      direction: "outbound",
      category: "initial_outreach",
      sent_text: pickInitialGreeting(now),
      ai_metadata: { phase: "initial_outreach" },
    }));

    const { error: insErr } = await supabase
      .from("webinar_messages")
      .insert(rowsToInsert);
    if (insErr) throw insErr;

    await supabase
      .from("webinar_campaigns")
      .update({ status: "active" })
      .eq("id", campaignId);

    revalidatePath(`/webinar/${campaignId}`);

    return { success: true, scheduled: rowsToInsert.length };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

// ─── Cadence ─────────────────────────────────────────────────────────────────

export async function listCadenceSteps(campaignId: string): Promise<{
  success: boolean;
  data?: WebinarCadenceStep[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("webinar_cadence_steps")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("step_order", { ascending: true });

    if (error) throw error;
    return { success: true, data: data as WebinarCadenceStep[] };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

export async function upsertCadenceStep(
  campaignId: string,
  step: Partial<WebinarCadenceStep> & { day_offset: number; message_template: string },
): Promise<{ success: boolean; data?: WebinarCadenceStep; error?: string }> {
  try {
    const supabase = await createClient();
    const payload = {
      campaign_id: campaignId,
      name: step.name ?? null,
      day_offset: step.day_offset,
      hour: step.hour ?? 10,
      minute: step.minute ?? 0,
      message_template: step.message_template,
      trigger_status: step.trigger_status ?? null,
      step_order: step.step_order ?? 0,
      enabled: step.enabled ?? true,
    };

    let query;
    if (step.id) {
      query = supabase
        .from("webinar_cadence_steps")
        .update(payload)
        .eq("id", step.id)
        .select()
        .single();
    } else {
      query = supabase
        .from("webinar_cadence_steps")
        .insert(payload)
        .select()
        .single();
    }

    const { data, error } = await query;
    if (error) throw error;
    revalidatePath(`/webinar/${campaignId}`);
    return { success: true, data: data as WebinarCadenceStep };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

export async function deleteCadenceStep(stepId: string, campaignId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("webinar_cadence_steps")
      .delete()
      .eq("id", stepId);

    if (error) throw error;
    revalidatePath(`/webinar/${campaignId}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}
