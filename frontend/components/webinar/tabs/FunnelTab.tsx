"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, RefreshCw, Smartphone } from "lucide-react";
import type { WebinarCampaign } from "@/types/webinar";
import {
  getInstanceStats,
  type InstanceStats,
} from "@/app/actions-webinar";

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
  const [instanceStats, setInstanceStats] = useState<InstanceStats[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  async function loadStats() {
    setLoadingStats(true);
    const r = await getInstanceStats(campaign.id);
    if (r.success) {
      setInstanceStats(r.data ?? []);
      setSnapshotAt(r.snapshot_at ?? null);
    }
    setLoadingStats(false);
  }

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id]);

  const totals = instanceStats.reduce(
    (acc, s) => ({
      sent_total: acc.sent_total + s.sent_total,
      sent_today: acc.sent_today + s.sent_today,
      failed_total: acc.failed_total + s.failed_total,
      replied_leads: acc.replied_leads + s.replied_leads,
      confirmed_leads: acc.confirmed_leads + s.confirmed_leads,
    }),
    {
      sent_total: 0,
      sent_today: 0,
      failed_total: 0,
      replied_leads: 0,
      confirmed_leads: 0,
    },
  );

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
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Performance por instância
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Disparos, respostas e confirmados por chip. Use pra detectar
                instância travada, banimento silencioso ou chip que mais converte.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadStats}
            className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
          >
            <RefreshCw
              className={`w-3 h-3 ${loadingStats ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
        </div>

        {loadingStats ? (
          <div className="text-center py-8 text-sm text-slate-400">
            Carregando estatísticas...
          </div>
        ) : instanceStats.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            Nenhum disparo registrado ainda. Quando a campanha rodar, as
            estatísticas por chip aparecem aqui.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <Stat
                label="Enviadas hoje"
                value={totals.sent_today}
                accent="indigo"
              />
              <Stat label="Total enviadas" value={totals.sent_total} />
              <Stat label="Falhas" value={totals.failed_total} />
              <Stat label="Responderam" value={totals.replied_leads} />
              <Stat
                label="Confirmados"
                value={totals.confirmed_leads}
                accent="emerald"
              />
            </div>

            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="text-left font-semibold py-2 pr-3">
                      Instância
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Hoje
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Total
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Falhas
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Inbound
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Respondeu
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Confirmou
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Presente
                    </th>
                    <th className="text-right font-semibold py-2 pl-2">
                      Taxa conf.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {instanceStats.map((s) => {
                    const convRate =
                      s.active_leads > 0
                        ? Math.round((s.confirmed_leads / s.active_leads) * 100)
                        : 0;
                    return (
                      <tr
                        key={s.instance}
                        className="border-b border-slate-50 hover:bg-slate-50/50"
                      >
                        <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-slate-800">
                          {s.instance}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-indigo-600">
                          {s.sent_today}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">
                          {s.sent_total}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-rose-600">
                          {s.failed_total || "-"}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-600">
                          {s.inbound_total}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">
                          {s.replied_leads}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-fuchsia-600">
                          {s.confirmed_leads}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-emerald-600">
                          {s.attended_leads}
                        </td>
                        <td className="py-2.5 pl-2 text-right tabular-nums font-bold text-slate-800">
                          {convRate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-slate-400 italic mt-4">
              Confirmados/presentes contam por <code>last_instance_used</code> do
              lead. Se um lead conversou por mais de um chip, conta no último que
              falou com ele.
              {snapshotAt && (
                <>
                  {" "}· Snapshot:{" "}
                  {new Date(snapshotAt).toLocaleString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </>
              )}
            </p>
          </>
        )}
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
  accent?: "emerald" | "indigo";
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "indigo"
        ? "text-indigo-600"
        : "text-slate-800";
  return (
    <div className="border border-slate-100 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
        {label}
      </div>
      <div className={`text-xl font-bold ${accentClass}`}>{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
