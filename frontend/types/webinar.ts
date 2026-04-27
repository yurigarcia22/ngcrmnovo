/**
 * Tipos do modulo Webinar.
 *
 * Modelo:
 * - WebinarCampaign: campanha de webinar (1 evento)
 * - WebinarCampaignLead: lead associado a campanha (snapshot)
 * - WebinarCadenceStep: template de mensagem da cadencia
 * - WebinarMessage: mensagem agendada/enviada por lead
 */

export type WebinarStatus =
  | "draft"
  | "scraping"
  | "enriching"
  | "ready"
  | "active"
  | "finished"
  | "archived";

export type WebinarFunnelStatus =
  | "scraped"
  | "enriched"
  | "invited"
  | "pending_optin"
  | "opted_in"
  | "viewed"
  | "replied"
  | "confirmed"
  | "attended"
  | "no_show"
  | "converted"
  | "interested_future"
  | "escalated"
  | "lost";

export type WebinarAiScore = "hot" | "warm" | "cold";

export type WebinarMessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "replied"
  | "failed"
  | "cancelled";

export interface WebinarCampaign {
  id: string;
  tenant_id: string;
  owner_id: string | null;

  name: string;
  theme: string | null;
  description: string | null;

  event_date: string | null;
  meet_link: string | null;
  offer_description: string | null;
  cal_link: string | null;
  instance_name: string | null;
  instance_names: string[] | null;

  target_nicho: string | null;
  target_cities: string[] | null;

  status: WebinarStatus;

  total_leads: number;
  total_invited: number;
  total_confirmed: number;
  total_attended: number;
  total_converted: number;

  created_at: string;
  updated_at: string;
}

export interface WebinarCampaignInput {
  name: string;
  theme?: string | null;
  description?: string | null;
  event_date?: string | null;
  meet_link?: string | null;
  offer_description?: string | null;
  cal_link?: string | null;
  instance_name?: string | null;
  instance_names?: string[] | null;
  target_nicho?: string | null;
  target_cities?: string[] | null;
}

export interface WebinarCampaignLead {
  id: string;
  campaign_id: string;
  cold_lead_id: string | null;

  company_name: string | null;
  phone: string;
  website: string | null;
  address: string | null;
  rating: number | null;
  reviews_count: number;

  ai_score: WebinarAiScore | null;
  ai_angle: string | null;
  ai_reasoning: string | null;
  ai_enriched_at: string | null;

  funnel_status: WebinarFunnelStatus;

  meet_clicked_at: string | null;
  attended_webinar: boolean;
  converted_to_call: boolean;
  call_scheduled_at: string | null;

  notes: string | null;
  loss_reason: string | null;

  // Dados do responsável coletados pelo agente IA
  responsible_name: string | null;
  responsible_email: string | null;
  responsible_direct_phone: string | null;

  // Lead affinity (failover de número)
  last_instance_used: string | null;

  created_at: string;
  updated_at: string;
  last_interaction_at: string | null;
}

export interface WebinarCadenceStep {
  id: string;
  campaign_id: string;
  name: string | null;
  day_offset: number;
  hour: number;
  minute: number;
  message_template: string;
  trigger_status: string | null;
  step_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebinarMessage {
  id: string;
  campaign_lead_id: string;
  cadence_step_id: string | null;
  scheduled_at: string;
  status: WebinarMessageStatus;
  sent_text: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  reply_text: string | null;
  reply_at: string | null;
  evolution_message_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export const WEBINAR_STATUS_LABELS: Record<WebinarStatus, string> = {
  draft: "Rascunho",
  scraping: "Extraindo leads",
  enriching: "Enriquecendo IA",
  ready: "Pronta",
  active: "Ativa",
  finished: "Finalizada",
  archived: "Arquivada",
};

export const WEBINAR_FUNNEL_LABELS: Record<WebinarFunnelStatus, string> = {
  scraped: "Coletado",
  enriched: "Enriquecido",
  invited: "Convite enviado",
  pending_optin: "Aguardando aceitar",
  opted_in: "Aceitou",
  viewed: "Visualizou",
  replied: "Respondeu",
  confirmed: "Confirmou presença",
  attended: "Presente no webinar",
  no_show: "Faltou",
  converted: "Agendou diagnóstico",
  interested_future: "Interesse futuro",
  escalated: "Escalado humano",
  lost: "Perdido",
};

export const WEBINAR_AI_SCORE_LABELS: Record<WebinarAiScore, string> = {
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
};
