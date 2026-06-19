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
      unique_leads_today: acc.unique_leads_today + (s.unique_leads_today ?? 0),
      failed_total: acc.failed_total + s.failed_total,
      replied_leads: acc.replied_leads + s.replied_leads,
      confirmed_leads: acc.confirmed_leads + s.confirmed_leads,
    }),
    {
      sent_total: 0,
      sent_today: 0,
      unique_leads_today: 0,
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

        <div className="flex flex-col md:flex-row gap-6">
          <div className="md:border-r md:border-slate-100 md:pr-6">
            <div className="text-sm font-semibold text-slate-700">Convertidos</div>
            <div className="text-4xl font-bold text-emerald-600 leading-tight mt-1">
              {campaign.total_converted}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {campaign.total_invited > 0
                ? `${Math.round((campaign.total_converted / campaign.total_invited) * 100)}% dos convidados`
                : "Sem convidados ainda"}
            </div>
          </div>

          <div className="flex-1 flex items-stretch flex-wrap divide-x divide-slate-100">
            <div className="flex-1 min-w-[110px] px-4 first:pl-0">
              <div className="text-xs font-medium text-slate-500">Total de leads</div>
              <div className="text-xl font-bold text-slate-800">{campaign.total_leads}</div>
            </div>
            <div className="flex-1 min-w-[110px] px-4">
              <div className="text-xs font-medium text-slate-500">Convidados</div>
              <div className="text-xl font-bold text-slate-800">{campaign.total_invited}</div>
            </div>
            <div className="flex-1 min-w-[110px] px-4">
              <div className="text-xs font-medium text-slate-500">Confirmados</div>
              <div className="text-xl font-bold text-slate-800">{campaign.total_confirmed}</div>
            </div>
            <div className="flex-1 min-w-[110px] px-4">
              <div className="text-xs font-medium text-slate-500">Presentes</div>
              <div className="text-xl font-bold text-slate-800">{campaign.total_attended}</div>
            </div>
            <div className="flex-1 min-w-[110px] px-4">
              <div className="text-xs font-medium text-slate-500">Taxa de presença</div>
              <div className="text-xl font-bold text-slate-800">
                {campaign.total_confirmed > 0
                  ? `${Math.round((campaign.total_attended / campaign.total_confirmed) * 100)}%`
                  : "-"}
              </div>
            </div>
            <div className="flex-1 min-w-[110px] px-4">
              <div className="text-xs font-medium text-slate-500">Custo / convertido</div>
              <div className="text-xl font-bold text-slate-800">R$ -</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Quando integrar gastos da campanha
              </div>
            </div>
          </div>
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
            aria-label="Atualizar estatísticas por instância"
            className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1 p-2.5 -m-2.5 rounded-md hover:bg-slate-50"
          >
            <RefreshCw
              className={`w-3 h-3 ${loadingStats ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
        </div>

        {loadingStats ? (
          <div className="text-center py-8 text-sm text-slate-500">
            Carregando estatísticas...
          </div>
        ) : instanceStats.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">
            Nenhum disparo registrado ainda. Quando a campanha rodar, as
            estatísticas por chip aparecem aqui.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
              <Stat
                label="Enviadas hoje"
                value={totals.sent_today}
                accent="indigo"
              />
              <Stat
                label="Leads únicos hoje"
                value={totals.unique_leads_today}
                hint="Distintos abordados"
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
                  <tr className="text-[11px] font-semibold text-slate-600 border-b border-slate-200">
                    <th className="text-left font-semibold py-2 pr-3">
                      Instância
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Msgs hoje
                    </th>
                    <th
                      className="text-right font-semibold py-2 px-2"
                      title="Leads únicos abordados hoje"
                    >
                      Leads hoje
                    </th>
                    <th className="text-right font-semibold py-2 px-2">
                      Total msgs
                    </th>
                    <th
                      className="text-right font-semibold py-2 px-2"
                      title="Leads únicos abordados no total"
                    >
                      Leads únicos
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
                    const msgsPerLead =
                      s.unique_leads_total > 0
                        ? s.sent_total / s.unique_leads_total
                        : 0;
                    const loopWarning = msgsPerLead >= 10;
                    return (
                      <tr
                        key={s.instance}
                        className="border-b border-slate-50 hover:bg-slate-50/50"
                      >
                        <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-slate-800">
                          {s.instance}
                          {loopWarning && (
                            <span
                              className="ml-1.5 inline-block text-[9px] font-bold uppercase text-amber-700 bg-amber-50 px-1 py-0.5 rounded"
                              title={`${msgsPerLead.toFixed(1)} msgs/lead — possível loop de auto-reply`}
                            >
                              loop?
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-indigo-600">
                          {s.sent_today}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-slate-800">
                          {s.unique_leads_today}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-slate-700">
                          {s.sent_total}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold text-slate-800">
                          {s.unique_leads_total}
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

            <p className="text-[11px] text-slate-500 italic mt-4">
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
        <h2 className="text-sm font-bold text-slate-800 mb-1">Visualização do funil</h2>
        <p className="text-xs text-slate-500 mb-4">
          Etapas que o lead percorre. As barras com volume real chegam com o funil
          interativo (kanban + tempo real) na Fase 5.
        </p>
        <ol className="divide-y divide-slate-100 border-y border-slate-100">
          {FUNNEL_STAGES.map((stage, i) => (
            <li key={stage.key} className="flex items-center gap-3 py-2.5">
              <span className="w-5 text-xs font-semibold text-slate-400 tabular-nums">
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-slate-700">{stage.label}</span>
              <span className="text-xs font-medium text-slate-400">—</span>
            </li>
          ))}
        </ol>
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
      <div className="text-xs font-medium text-slate-500 mb-1">
        {label}
      </div>
      <div className={`text-xl font-bold ${accentClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}
