"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/simple-ui";
import {
  Download,
  Mail,
  Phone,
  CheckCircle2,
  XCircle,
  Calendar,
  Sparkles,
  ArrowRightCircle,
  ChevronDown,
  Briefcase,
  CalendarCheck,
  Trophy,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  listConfirmedLeads,
  exportConfirmedLeadsCSV,
  pushConfirmedLeadToCrm,
} from "@/app/actions-webinar";
import {
  WEBINAR_FUNNEL_LABELS,
  type WebinarCampaign,
  type WebinarCampaignLead,
} from "@/types/webinar";

type CrmMode = "lead" | "meeting" | "sale";

const CRM_MODE_META: Record<CrmMode, { label: string; Icon: any; cls: string }> = {
  lead: {
    label: "Como Lead novo",
    Icon: Briefcase,
    cls: "text-slate-700 hover:bg-slate-100",
  },
  meeting: {
    label: "Como Reunião marcada",
    Icon: CalendarCheck,
    cls: "text-amber-700 hover:bg-amber-50",
  },
  sale: {
    label: "Como Venda fechada",
    Icon: Trophy,
    cls: "text-emerald-700 hover:bg-emerald-50",
  },
};

type FilterKey = "all" | "confirmed" | "attended" | "no_show" | "converted";

const STATUS_BADGE: Record<string, { label: string; cls: string; Icon: any }> = {
  confirmed: {
    label: "Confirmado",
    cls: "bg-emerald-50 text-emerald-700",
    Icon: CheckCircle2,
  },
  attended: {
    label: "Presente",
    cls: "bg-indigo-50 text-indigo-700",
    Icon: Sparkles,
  },
  no_show: {
    label: "Faltou",
    cls: "bg-amber-50 text-amber-700",
    Icon: XCircle,
  },
  converted: {
    label: "Convertido",
    cls: "bg-fuchsia-50 text-fuchsia-700",
    Icon: Sparkles,
  },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ConfirmedTab({ campaign }: { campaign: WebinarCampaign }) {
  const [leads, setLeads] = useState<WebinarCampaignLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [exporting, setExporting] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );

  function openMenu(leadId: string, anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
    setOpenMenuId(leadId);
  }

  async function load() {
    setLoading(true);
    const result = await listConfirmedLeads(campaign.id, filter);
    if (result.success) setLeads(result.data ?? []);
    else toast.error(`Erro: ${result.error}`);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [campaign.id, filter]);

  // Fecha menu ao clicar fora
  useEffect(() => {
    if (!openMenuId) return;
    function onClick() {
      setOpenMenuId(null);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openMenuId]);

  async function handlePushToCrm(leadId: string, mode: CrmMode) {
    setPushingId(leadId);
    setOpenMenuId(null);
    const result = await pushConfirmedLeadToCrm(leadId, mode);
    setPushingId(null);
    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    toast.success(
      mode === "sale"
        ? "Venda registrada no CRM"
        : mode === "meeting"
          ? "Reunião agendada no CRM"
          : "Lead enviado pro CRM",
    );
    load();
  }

  async function handleExport() {
    setExporting(true);
    const result = await exportConfirmedLeadsCSV(campaign.id);
    setExporting(false);
    if (!result.success || !result.csv) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    // Download via blob
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.filename ?? "confirmados.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV baixado");
  }

  const counts = {
    all: leads.length,
    confirmed: leads.filter((l) => l.funnel_status === "confirmed").length,
    attended: leads.filter((l) => l.funnel_status === "attended").length,
    no_show: leads.filter((l) => l.funnel_status === "no_show").length,
    converted: leads.filter((l) => l.funnel_status === "converted").length,
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Leads confirmados</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Quem completou a qualificação no agente IA. Inclui nome, email e telefone direto coletados.
            </p>
          </div>
          <Button
            onClick={handleExport}
            disabled={exporting || leads.length === 0}
            variant="outline"
            className="shrink-0"
          >
            <Download className="w-4 h-4 mr-2" />
            {exporting ? "Exportando..." : "Exportar CSV"}
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(
            [
              { k: "all", label: "Todos" },
              { k: "confirmed", label: "Confirmados" },
              { k: "attended", label: "Presentes" },
              { k: "no_show", label: "Faltaram" },
              { k: "converted", label: "Convertidos" },
            ] as { k: FilterKey; label: string }[]
          ).map((f) => (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                filter === f.k
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
              <span className="ml-1.5 opacity-70">{counts[f.k as keyof typeof counts] ?? 0}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-slate-400">
            Carregando...
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 mb-3">
              <CheckCircle2 className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">
              Nenhum lead confirmado ainda nesta categoria.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Confirmados aparecem aqui quando o agente IA coleta nome + email/telefone.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200">
                  <th className="px-2 py-2 font-semibold text-slate-600">Empresa</th>
                  <th className="px-2 py-2 font-semibold text-slate-600">Responsável</th>
                  <th className="px-2 py-2 font-semibold text-slate-600">Contato direto</th>
                  <th className="px-2 py-2 font-semibold text-slate-600">WhatsApp</th>
                  <th className="px-2 py-2 font-semibold text-slate-600">Status</th>
                  <th className="px-2 py-2 font-semibold text-slate-600">Última interação</th>
                  <th className="px-2 py-2 font-semibold text-slate-600 text-right">CRM</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const badge = STATUS_BADGE[lead.funnel_status];
                  const Icon = badge?.Icon ?? CheckCircle2;
                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-slate-100 hover:bg-slate-50/50"
                    >
                      <td className="px-2 py-3 text-slate-700 font-medium">
                        {lead.company_name ?? (
                          <span className="text-slate-400 italic">Sem nome</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-slate-700">
                        {lead.responsible_name ?? (
                          <span className="text-slate-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <div className="space-y-1">
                          {lead.responsible_email && (
                            <div className="flex items-center gap-1 text-xs text-slate-600">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <a
                                href={`mailto:${lead.responsible_email}`}
                                className="hover:text-indigo-600"
                              >
                                {lead.responsible_email}
                              </a>
                            </div>
                          )}
                          {lead.responsible_direct_phone && (
                            <div className="flex items-center gap-1 text-xs text-slate-600">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {lead.responsible_direct_phone}
                            </div>
                          )}
                          {!lead.responsible_email && !lead.responsible_direct_phone && (
                            <span className="text-xs text-slate-400 italic">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-slate-600 font-mono text-xs">
                        {lead.phone}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                            badge?.cls ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <Icon className="w-3 h-3" />
                          {badge?.label ?? WEBINAR_FUNNEL_LABELS[lead.funnel_status]}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {fmtDate(lead.last_interaction_at)}
                        </div>
                      </td>
                      <td
                        className="px-2 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.crm_deal_id ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                              lead.crm_pushed_mode === "sale"
                                ? "bg-emerald-50 text-emerald-700"
                                : lead.crm_pushed_mode === "meeting"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            <ExternalLink className="w-3 h-3" />
                            {lead.crm_pushed_mode === "sale"
                              ? "Vendido"
                              : lead.crm_pushed_mode === "meeting"
                                ? "Reunião"
                                : "No CRM"}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={pushingId === lead.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openMenuId === lead.id) {
                                setOpenMenuId(null);
                              } else {
                                openMenu(lead.id, e.currentTarget);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            <ArrowRightCircle className="w-3.5 h-3.5" />
                            {pushingId === lead.id ? "Enviando..." : "Enviar"}
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Dropdown menu via portal — escapa do overflow:auto da tabela */}
      {openMenuId && menuPos && typeof window !== "undefined" &&
        createPortal(
          <div
            className="fixed z-50 w-52 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
            style={{ top: menuPos.top, right: menuPos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            {(["lead", "meeting", "sale"] as CrmMode[]).map((m) => {
              const meta = CRM_MODE_META[m];
              const Icon = meta.Icon;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handlePushToCrm(openMenuId, m)}
                  className={`w-full text-left text-xs px-3 py-2 flex items-center gap-2 ${meta.cls}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
