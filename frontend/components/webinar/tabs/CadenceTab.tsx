"use client";

import { Card } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import type { WebinarCampaign } from "@/types/webinar";

const SUGGESTED_CADENCE = [
  { day: -7, name: "Convite inicial", template: "Oi {empresa}, vamos rodar um webinar exclusivo sobre {tema} dia {data}. Posso te mandar o link?" },
  { day: -3, name: "Reforco", template: "Oi {empresa}, lembrete que o webinar {tema} acontece em 3 dias. Confirma sua presenca?" },
  { day: -1, name: "Vespera", template: "{empresa}, o webinar e amanha as {hora}. Link: {meet_link}" },
  { day: 0, name: "1h antes", template: "{empresa}, em 1 hora comecamos o webinar. Salva o link: {meet_link}" },
  { day: 0, name: "10 min antes", template: "{empresa}, ta comecando agora. Entra: {meet_link}" },
  { day: 1, name: "Apos evento (presente)", template: "Que bom te ver no webinar! Quer agendar uma call de diagnostico? {cal_link}" },
  { day: 1, name: "Apos evento (ausente)", template: "Senti tua falta no webinar de hoje. Quer marcar um diagnostico? {cal_link}" },
];

export function CadenceTab({ campaign }: { campaign: WebinarCampaign }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Cadencia da campanha</h2>
            <p className="text-xs text-slate-500 mt-1">
              Configure as mensagens que serao disparadas em cada momento da cadencia.
              Use variaveis: <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">{"{empresa}"}</code>{" "}
              <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">{"{tema}"}</code>{" "}
              <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">{"{data}"}</code>{" "}
              <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">{"{hora}"}</code>{" "}
              <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">{"{meet_link}"}</code>{" "}
              <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">{"{cal_link}"}</code>
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Sugestao de cadencia padrao</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Estrutura recomendada para campanhas de webinar
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {SUGGESTED_CADENCE.map((step, i) => (
            <div
              key={i}
              className="border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                  D{step.day >= 0 ? "+" : ""}{step.day}
                </span>
                <span className="text-sm font-bold text-slate-700">{step.name}</span>
              </div>
              <p className="text-xs text-slate-500 ml-1 mt-2">"{step.template}"</p>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400 italic">
            Editor de cadencia interativo disponivel na Fase 4. Por enquanto, ajusta os
            templates direto no banco em <code className="text-[10px] bg-slate-100 px-1 py-0.5 rounded">webinar_cadence_steps</code>.
          </p>
        </div>
      </Card>
    </div>
  );
}
