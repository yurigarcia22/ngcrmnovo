"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button, Input } from "@/components/ui/simple-ui";
import { Search, Sparkles, UserPlus, Send, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addLeadManually,
  listCampaignLeads,
  sendTestMessageToLead,
} from "@/app/actions-webinar";
import {
  WEBINAR_FUNNEL_LABELS,
  type WebinarCampaign,
  type WebinarCampaignLead,
} from "@/types/webinar";

export function LeadsTab({ campaign }: { campaign: WebinarCampaign }) {
  const router = useRouter();
  const [leads, setLeads] = useState<WebinarCampaignLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pending, startTransition] = useTransition();

  async function loadLeads() {
    setLoading(true);
    const result = await listCampaignLeads(campaign.id);
    if (result.success) {
      setLeads(result.data ?? []);
    } else {
      toast.error(`Erro: ${result.error}`);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLeads();
  }, [campaign.id]);

  function handleSend(lead: WebinarCampaignLead) {
    startTransition(async () => {
      const result = await sendTestMessageToLead(lead.id);
      if (result.success) {
        toast.success(`Mensagem enviada pra ${lead.phone}`);
        loadLeads();
        router.refresh();
      } else {
        toast.error(`Falha: ${result.error}`);
      }
    });
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Card className="p-6">
        <h2 className="text-sm font-bold text-slate-800 mb-1">Acoes</h2>
        <p className="text-xs text-slate-500 mb-4">
          Construa a base de leads dessa campanha de 3 jeitos
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ActionCard
            icon={Search}
            title="Extrair via scraper"
            description="Usa nicho e cidades pra buscar empresas no Google Maps"
            cta="Disponivel na Fase 2"
            disabled
          />
          <ActionCard
            icon={Sparkles}
            title="Enriquecer com IA"
            description="Classifica leads (hot/warm/cold) e gera angulo de abordagem"
            cta="Disponivel na Fase 3"
            disabled
          />
          <ActionCard
            icon={UserPlus}
            title="Adicionar manualmente"
            description="Cola um numero individual pra teste ou complemento"
            cta="Adicionar lead"
            onClick={() => setShowAddModal(true)}
          />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Leads da campanha</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {leads.length} leads cadastrados
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Carregando...</div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            Nenhum lead ainda. Adiciona manualmente acima.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-100">
                  <th className="pb-2 font-semibold text-slate-600">Empresa</th>
                  <th className="pb-2 font-semibold text-slate-600">Telefone</th>
                  <th className="pb-2 font-semibold text-slate-600">Status</th>
                  <th className="pb-2 font-semibold text-slate-600 text-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 text-slate-700">
                      {lead.company_name ?? <span className="text-slate-400">Sem nome</span>}
                    </td>
                    <td className="py-3 text-slate-600 font-mono text-xs">{lead.phone}</td>
                    <td className="py-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-indigo-50 text-indigo-700">
                        {WEBINAR_FUNNEL_LABELS[lead.funnel_status]}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => handleSend(lead)}
                        className="text-xs"
                      >
                        <Send className="w-3 h-3 mr-1" />
                        Disparar mensagem
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showAddModal && (
        <AddLeadModal
          campaignId={campaign.id}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            loadLeads();
          }}
        />
      )}
    </div>
  );
}

function AddLeadModal({
  campaignId,
  onClose,
  onAdded,
}: {
  campaignId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({ phone: "", company_name: "", website: "" });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.phone.trim()) {
      toast.error("Telefone e obrigatorio");
      return;
    }
    setSaving(true);
    const result = await addLeadManually(campaignId, {
      phone: form.phone.trim(),
      company_name: form.company_name.trim() || undefined,
      website: form.website.trim() || undefined,
    });
    setSaving(false);

    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    toast.success("Lead adicionado");
    onAdded();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Adicionar lead</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Telefone *</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="5537999577862"
            />
            <p className="text-[11px] text-slate-400">
              Formato internacional sem + (ex: 5511999999999)
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Nome da empresa
            </label>
            <Input
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              placeholder="Petshop Cao Feliz"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Site</label>
            <Input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {saving ? "Salvando..." : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  description,
  cta,
  disabled,
  onClick,
}: {
  icon: any;
  title: string;
  description: string;
  cta: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const Component: any = disabled ? "div" : "button";
  return (
    <Component
      onClick={disabled ? undefined : onClick}
      className={`text-left border rounded-xl p-4 w-full ${
        disabled
          ? "border-slate-200 bg-slate-50/50 opacity-70"
          : "border-slate-200 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-indigo-600" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">{description}</p>
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${
          disabled ? "text-slate-400" : "text-indigo-600"
        }`}
      >
        {cta}
      </span>
    </Component>
  );
}
