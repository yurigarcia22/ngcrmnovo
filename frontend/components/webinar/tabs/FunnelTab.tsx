"use client";

import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import type { WebinarCampaign } from "@/types/webinar";

const FUNNEL_STAGES = [
  { key: "scraped", label: "Coletados", color: "bg-slate-200" },
  { key: "enriched", label: "Enriquecidos", color: "bg-blue-200" },
  { key: "invited", label: "Convidados", color: "bg-indigo-300" },
  { key: "viewed", label: "Visualizaram", color: "bg-violet-300" },
  { key: "replied", label: "Responderam", color: "bg-purple-400" },
  { key: "confirmed", label: "Confirmaram", color: "bg-fuchsia-400" },
  { key: "attended", label: "Presentes", color: "bg-emerald-400" },
  { key: "converted", label: "Diagnóstico", color: "bg-emerald-600" },
];

export function FunnelTab({ campaign }: { campaign: WebinarCampaign }) {
  return (
    <div className="space-y-6 max-w-5xl">
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Funil em tempo real</h2>
            <p className="text-xs text-slate-500 mt-1">
              Visualização das métricas e movimentação dos leads pelo funil. Atualizado em
              tempo real via Realtime do Supabase quando estiver ativo.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total de leads" value={campaign.total_leads} />
          <Stat label="Convidados" value={campaign.total_invited} />
          <Stat label="Confirmados" value={campaign.total_confirmed} />
          <Stat label="Presentes" value={campaign.total_attended} />
          <Stat label="Convertidos" value={campaign.total_converted} accent="emerald" />
          <Stat
            label="Taxa de presença"
            value={
              campaign.total_confirmed > 0
                ? `${Math.round((campaign.total_attended / campaign.total_confirmed) * 100)}%`
                : "-"
            }
          />
          <Stat
            label="Taxa de conversão"
            value={
              campaign.total_invited > 0
                ? `${Math.round((campaign.total_converted / campaign.total_invited) * 100)}%`
                : "-"
            }
            accent="emerald"
          />
          <Stat
            label="Custo / convertido"
            value="R$ -"
            hint="Calcula quando integrar com gastos da campanha"
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-bold text-slate-800 mb-4">Visualização do funil</h2>
        <div className="space-y-2">
          {FUNNEL_STAGES.map((stage) => (
            <div key={stage.key} className="flex items-center gap-3">
              <div className="w-32 text-xs font-medium text-slate-600">{stage.label}</div>
              <div className="flex-1 h-8 bg-slate-50 rounded-md relative overflow-hidden">
                <div
                  className={`h-full ${stage.color} transition-all`}
                  style={{ width: "0%" }}
                />
              </div>
              <div className="w-12 text-xs font-bold text-slate-700 text-right">0</div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 italic">
            Funil interativo com kanban e atualização em tempo real disponível na Fase 5.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "emerald";
}) {
  return (
    <div className="border border-slate-100 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
        {label}
      </div>
      <div
        className={`text-xl font-bold ${accent === "emerald" ? "text-emerald-600" : "text-slate-800"}`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
