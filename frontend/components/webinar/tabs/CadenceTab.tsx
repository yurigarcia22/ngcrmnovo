"use client";

import { Card } from "@/components/ui/card";
import { Calendar, MessageCircle, Bell, Sparkles, Clock } from "lucide-react";
import type { WebinarCampaign } from "@/types/webinar";

const PROFILES = [
  {
    key: "RICA",
    label: "Rica",
    when: "7+ dias até evento",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    steps: [
      { day: "D-5", category: "nutricao", label: "Nutrição 1 (provoca reflexão)", template: "Oi {primeiro_nome}, vou ser direto. A maioria das clínicas perde dinheiro NÃO no tráfego, e sim no que vem antes (oferta) e depois (atendimento). Dia {data} eu abro os 4 pilares disso na prática." },
      { day: "D-3", category: "nutricao", label: "Nutrição 2 (case/dado)", template: "{primeiro_nome}, mais um teaser: já vi clínica faturar 2x sem mexer em ad. Só ajustando como recebia o paciente novo. Não é mágica, é operação. Te vejo dia {data} às {hora}." },
      { day: "D-2", category: "nutricao", label: "Nutrição 3 (urgência leve)", template: "{primeiro_nome}, vai ser ao vivo, sem gravação prévia. Dia {data} às {hora}, 30-40 min. Bloqueia agenda." },
      { day: "D-1", category: "lembrete", label: "Véspera + Link", template: "Oi {primeiro_nome}, lembrete: o webinar é amanhã às {hora}.\n\nLink: {meet_link}\n\nTe espero." },
      { day: "D-0", category: "lembrete", label: "1h antes", template: "Oi {primeiro_nome}, em 1 hora começamos.\n\nLink: {meet_link}" },
      { day: "D-0", category: "lembrete", label: "10 min antes", template: "{primeiro_nome}, tá começando. Entra: {meet_link}" },
      { day: "D+1", category: "post", label: "Pós-evento (presente)", template: "Oi {primeiro_nome}, que bom te ver no webinar ontem.\n\nQuer trocar uma ideia 30 min sobre como aplicar isso na {empresa}? Marca aqui:\n{cal_link}" },
      { day: "D+1", category: "post", label: "Pós-evento (ausente)", template: "Oi {primeiro_nome}, senti tua falta no webinar ontem.\n\nVou te mandar a gravação aqui mais tarde. E se quiser conversar sobre o cenário da {empresa}: {cal_link}" },
    ],
  },
  {
    key: "MEDIA",
    label: "Média",
    when: "3-7 dias até evento",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    steps: [
      { day: "D-2", category: "nutricao", label: "Nutrição", template: "Oi {primeiro_nome}, pra já aquecer o evento de {data}: a maioria das clínicas perde cliente NÃO no tráfego pago, e sim na agenda. A gente vai abrir os 4 pilares que mudam isso." },
      { day: "D-1", category: "lembrete", label: "Véspera + Link", template: "Oi {primeiro_nome}, lembrete: o webinar é amanhã às {hora}.\n\nLink: {meet_link}" },
      { day: "D-0", category: "lembrete", label: "1h antes", template: "{primeiro_nome}, em 1 hora começamos. Link: {meet_link}" },
      { day: "D-0", category: "lembrete", label: "10 min antes", template: "{primeiro_nome}, tá começando. Entra: {meet_link}" },
      { day: "D+1", category: "post", label: "Pós-evento (presente)", template: "Oi {primeiro_nome}, que bom te ver no webinar ontem. Quer trocar uma ideia 30 min sobre como aplicar isso na {empresa}? Marca aqui: {cal_link}" },
      { day: "D+1", category: "post", label: "Pós-evento (ausente)", template: "Oi {primeiro_nome}, senti tua falta ontem. Te mando a gravação. Se quiser falar sobre o cenário da {empresa}: {cal_link}" },
    ],
  },
  {
    key: "CURTA",
    label: "Curta",
    when: "1-3 dias até evento",
    color: "bg-amber-50 text-amber-700 border-amber-200",
    steps: [
      { day: "D-1", category: "lembrete", label: "Véspera + Link", template: "Oi {primeiro_nome}, lembrete: webinar amanhã às {hora}.\n\nLink: {meet_link}\n\nTe espero." },
      { day: "D-0", category: "lembrete", label: "1h antes", template: "{primeiro_nome}, em 1 hora começamos. Link: {meet_link}" },
      { day: "D-0", category: "lembrete", label: "10 min antes", template: "{primeiro_nome}, tá começando. Entra: {meet_link}" },
      { day: "D+1", category: "post", label: "Pós (presente)", template: "Oi {primeiro_nome}, que bom te ver ontem. Quer falar sobre {empresa} 30 min? {cal_link}" },
      { day: "D+1", category: "post", label: "Pós (ausente)", template: "Oi {primeiro_nome}, senti tua falta. Te mando a gravação. Conversamos sobre {empresa}? {cal_link}" },
    ],
  },
  {
    key: "EXPRESS",
    label: "Express",
    when: "12-24h até evento",
    color: "bg-rose-50 text-rose-700 border-rose-200",
    steps: [
      { day: "+30min após confirmar", category: "lembrete", label: "Lembrete imediato", template: "{primeiro_nome}, anotei aqui. {tema}, {data} às {hora}. Link: {meet_link}" },
      { day: "D-0", category: "lembrete", label: "10 min antes", template: "{primeiro_nome}, tá começando. Entra: {meet_link}" },
      { day: "D+1", category: "post", label: "Pós (presente)", template: "Oi {primeiro_nome}, que bom te ver. Quer falar sobre {empresa} 30 min? {cal_link}" },
      { day: "D+1", category: "post", label: "Pós (ausente)", template: "Oi {primeiro_nome}, senti tua falta. Te mando a gravação. {cal_link}" },
    ],
  },
  {
    key: "FINAL",
    label: "Final",
    when: "Menos de 12h até evento",
    color: "bg-slate-50 text-slate-700 border-slate-200",
    steps: [
      { day: "+5min após confirmar", category: "lembrete", label: "Imediato", template: "{primeiro_nome}, vai ser hoje às {hora}.\n\nLink: {meet_link}\n\nTe espero." },
      { day: "D+1", category: "post", label: "Pós (presente)", template: "Oi {primeiro_nome}, que bom te ver. Quer conversar sobre {empresa}? {cal_link}" },
      { day: "D+1", category: "post", label: "Pós (ausente)", template: "Oi {primeiro_nome}, senti tua falta. Te mando a gravação. {cal_link}" },
    ],
  },
];

const CATEGORY_BADGE: Record<string, { label: string; cls: string; Icon: any }> = {
  nutricao: { label: "Nutrição", cls: "bg-violet-50 text-violet-700", Icon: Sparkles },
  lembrete: { label: "Lembrete", cls: "bg-indigo-50 text-indigo-700", Icon: Bell },
  post: { label: "Pós-evento", cls: "bg-emerald-50 text-emerald-700", Icon: Calendar },
};

export function CadenceTab({ campaign }: { campaign: WebinarCampaign }) {
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Cabeçalho explicativo */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Cadência da campanha</h2>
            <p className="text-xs text-slate-500 mt-1">
              A cadência tem 2 fases. A primeira é conversacional (agente IA conduz). A segunda é fixa, adaptativa por tempo até o evento.
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-4">
          Variáveis disponíveis nos templates da Fase 2:{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">{"{primeiro_nome}"}</code>{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">{"{empresa}"}</code>{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">{"{tema}"}</code>{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">{"{data}"}</code>{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">{"{hora}"}</code>{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">{"{meet_link}"}</code>{" "}
          <code className="bg-slate-100 px-1 py-0.5 rounded">{"{cal_link}"}</code>
        </div>
      </Card>

      {/* Fase 1 */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-900">
              Fase 1 — Abordagem inicial (conversacional)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Cron dispara UMA saudação variada por turno do dia (manhã/tarde/noite, 4-6 variações cada). Quando o lead responde, o agente IA conduz toda a qualificação até confirmar (com nome + email/telefone).
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Saudação inicial (variações sorteadas por turno)
            </div>
            <div className="text-xs text-slate-700 font-mono space-y-1">
              <div>Manhã: "Bom dia, tudo bem?" / "Bom dia! Tudo bem?" / "Olá, bom dia! Tudo bem?"</div>
              <div>Tarde: "Boa tarde, tudo bem?" / "Boa tarde! Tudo bem?" / "Olá, boa tarde, tudo bem?"</div>
              <div>Noite: "Boa noite, tudo bem?" / "Boa noite! Tudo bem?" / "Oi, boa noite, tudo bem?"</div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Após resposta — agente conduz
            </div>
            <ul className="text-xs text-slate-600 space-y-1 ml-1">
              <li>1. Pergunta se fala com o responsável pela {"{empresa}"}</li>
              <li>2. Pitch direto do evento (tema, data, hora, gratuito)</li>
              <li>3. Se aceita, pede nome do responsável + email/telefone direto</li>
              <li>4. Confirma reserva e agenda Fase 2 automaticamente</li>
              <li>5. Se objeção, aplica reversal (mapa de 6 objeções comuns)</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Fase 2 */}
      <Card className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-violet-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-900">
              Fase 2 — Cadência adaptativa (após confirmação)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Quando o lead confirma, o sistema escolhe automaticamente 1 dos 5 perfis baseado em quanto falta pro evento. Quanto mais tempo, mais nutrição. Quanto menos tempo, mais comprimida.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {PROFILES.map((p) => (
            <div key={p.key} className="border border-slate-200 rounded-xl overflow-hidden">
              <div
                className={`flex items-center justify-between px-4 py-2 border-b ${p.color}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">Perfil {p.label}</span>
                  <span className="text-xs opacity-70">({p.when})</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                  {p.steps.length} toques
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {p.steps.map((s, i) => {
                  const badge = CATEGORY_BADGE[s.category];
                  const Icon = badge?.Icon ?? Bell;
                  return (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {s.day}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge?.cls ?? "bg-slate-100"}`}
                        >
                          <Icon className="w-3 h-3" />
                          {badge?.label}
                        </span>
                        <span className="text-xs text-slate-700 font-medium">
                          {s.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 ml-1 italic whitespace-pre-line">
                        "{s.template}"
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Pra editar templates, ajusta no arquivo{" "}
            <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">
              frontend/lib/webinar/cadences.ts
            </code>
            . O agente da Fase 1 fica em{" "}
            <code className="text-[11px] bg-slate-100 px-1 py-0.5 rounded">
              frontend/lib/webinar/agent-prompt.ts
            </code>
            . Editor visual no CRM disponível na Fase 5.
          </p>
        </div>
      </Card>
    </div>
  );
}
