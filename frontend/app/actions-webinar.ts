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
  CADENCES,
  pickCadence,
  scheduleSteps,
  renderTemplate,
} from "@/lib/webinar/cadences";
import { pickInstance, sendTextViaEvolution } from "@/lib/webinar/evolution";

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
    const { data, error } = await supabase
      .from("webinar_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, data: data as WebinarCampaign[] };
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
    return { success: true, data: data as WebinarCampaign };
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

// ─── Start campaign (adaptive cadence) ───────────────────────────────────────

export async function startCampaign(campaignId: string): Promise<{
  success: boolean;
  scheduled?: number;
  cadence?: string;
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

    const eventDate = new Date(campaign.event_date);
    const now = new Date();
    const cadenceProfile = pickCadence(eventDate, now);
    const steps = CADENCES[cadenceProfile];
    const scheduledSteps = scheduleSteps(steps, eventDate, now);

    if (scheduledSteps.length === 0) {
      throw new Error(
        "Evento ja passou. Nenhum step de cadencia possivel.",
      );
    }

    const { data: leads, error: lErr } = await supabase
      .from("webinar_campaign_leads")
      .select("id, phone, company_name, funnel_status")
      .eq("campaign_id", campaignId)
      .in("funnel_status", ["scraped", "enriched"]);
    if (lErr) throw lErr;
    if (!leads || leads.length === 0) {
      throw new Error("Nenhum lead apto pra cadência (status scraped/enriched)");
    }

    const dataFmt = eventDate.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
    });
    const horaFmt = eventDate.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const rowsToInsert: any[] = [];
    for (const lead of leads) {
      const empresa = lead.company_name ?? "tudo bem";
      for (const { step, scheduledAt } of scheduledSteps) {
        const text = renderTemplate(step.template, {
          empresa,
          tema: campaign.theme,
          data: dataFmt,
          hora: horaFmt,
          meet_link: campaign.meet_link ?? "",
          cal_link: campaign.cal_link ?? "",
        });
        rowsToInsert.push({
          campaign_lead_id: lead.id,
          scheduled_at: scheduledAt.toISOString(),
          status: "pending",
          direction: "outbound",
          sent_text: text,
          ai_metadata: { cadence: cadenceProfile, step_label: step.label },
        });
      }
    }

    const { error: insErr } = await supabase
      .from("webinar_messages")
      .insert(rowsToInsert);
    if (insErr) throw insErr;

    await supabase
      .from("webinar_campaigns")
      .update({ status: "active" })
      .eq("id", campaignId);

    revalidatePath(`/webinar/${campaignId}`);

    return {
      success: true,
      scheduled: rowsToInsert.length,
      cadence: cadenceProfile,
    };
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
