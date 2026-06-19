"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/simple-ui";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Play, Pause, Wifi, WifiOff, RefreshCw, Webhook, ShieldCheck, Loader2 } from "lucide-react";
import {
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  validateCampaignLeads,
  getValidationStats,
  type ValidationStats,
} from "@/app/actions-webinar";
import {
  listAvailableInstances,
  syncWebhooksForInstances,
} from "@/app/actions-evolution";
import type { WebinarCampaign } from "@/types/webinar";

type EvoInstance = {
  name: string;
  connectionStatus: string;
  profileName: string | null;
  ownerJid: string | null;
};

function toLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

export function SetupTab({ campaign }: { campaign: WebinarCampaign }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: campaign.name,
    theme: campaign.theme ?? "",
    description: campaign.description ?? "",
    event_date: toLocalDatetime(campaign.event_date),
    meet_link: campaign.meet_link ?? "",
    offer_description: campaign.offer_description ?? "",
    cal_link: campaign.cal_link ?? "",
    target_nicho: campaign.target_nicho ?? "",
    target_cities: (campaign.target_cities ?? []).join(", "),
    daily_cap_per_instance:
      campaign.daily_cap_per_instance != null
        ? String(campaign.daily_cap_per_instance)
        : "",
    cadence_enabled: !!campaign.cadence_enabled,
  });

  const initialSelected = new Set([
    ...(campaign.instance_names ?? []),
    ...(campaign.instance_name ? [campaign.instance_name] : []),
  ]);
  const [selectedInstances, setSelectedInstances] = useState<Set<string>>(initialSelected);
  const [instances, setInstances] = useState<EvoInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [syncingWebhooks, setSyncingWebhooks] = useState(false);

  // Validação WhatsApp
  const [valStats, setValStats] = useState<ValidationStats | null>(null);
  const [validating, setValidating] = useState(false);

  async function loadValidationStats() {
    const r = await getValidationStats(campaign.id);
    if (r.success && r.data) setValStats(r.data);
  }
  useEffect(() => { loadValidationStats(); }, [campaign.id]);
  useEffect(() => {
    if (!validating) return;
    const id = setInterval(loadValidationStats, 3000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validating]);

  async function handleValidateNow() {
    setValidating(true);
    try {
      // Roda em loop até processar tudo (cada chamada processa até 100)
      let totalProcessed = 0;
      for (let i = 0; i < 20; i++) {
        const r = await validateCampaignLeads(campaign.id, 100);
        if (!r.success || !r.data) break;
        totalProcessed += r.data.processed;
        if (r.data.processed === 0) break;
        await loadValidationStats();
      }
      toast.success(`Validação concluída — ${totalProcessed} leads processados`);
      await loadValidationStats();
      router.refresh();
    } catch (e: any) {
      toast.error(`Erro: ${e?.message ?? "?"}`);
    } finally {
      setValidating(false);
    }
  }

  async function syncWebhooks() {
    const list = Array.from(selectedInstances);
    if (list.length === 0) {
      toast.error("Marque pelo menos uma instância antes de sincronizar.");
      return;
    }
    setSyncingWebhooks(true);
    try {
      const r = await syncWebhooksForInstances(list);
      if (!r.success) {
        toast.error(`Falha sincronizando: ${r.error}`);
        return;
      }
      const ok = r.results?.filter((x) => x.ok).length ?? 0;
      const fail = r.results?.filter((x) => !x.ok) ?? [];
      if (fail.length === 0) {
        toast.success(`${ok} webhook(s) configurado(s) no N8N.`);
      } else {
        toast.warning(
          `${ok} ok, ${fail.length} falharam: ${fail.map((f) => f.instance).join(", ")}`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "erro");
    } finally {
      setSyncingWebhooks(false);
    }
  }

  async function loadInstances() {
    setLoadingInstances(true);
    const r = await listAvailableInstances();
    if (r.success) setInstances(r.data ?? []);
    else toast.error(`Falha listando instâncias: ${r.error}`);
    setLoadingInstances(false);
  }

  useEffect(() => {
    loadInstances();
  }, []);

  function toggleInstance(name: string) {
    setSelectedInstances((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const update = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((s) => ({ ...s, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    const instanceList = Array.from(selectedInstances);
    const result = await updateCampaign(campaign.id, {
      name: form.name.trim(),
      theme: form.theme.trim() || null,
      description: form.description.trim() || null,
      event_date: form.event_date ? new Date(form.event_date).toISOString() : null,
      meet_link: form.meet_link.trim() || null,
      offer_description: form.offer_description.trim() || null,
      cal_link: form.cal_link.trim() || null,
      instance_name: instanceList[0] ?? null,
      instance_names: instanceList.length ? instanceList : null,
      target_nicho: form.target_nicho.trim() || null,
      target_cities: form.target_cities
        ? form.target_cities.split(",").map((c) => c.trim()).filter(Boolean)
        : null,
      daily_cap_per_instance: form.daily_cap_per_instance
        ? Math.max(1, Math.min(1000, parseInt(form.daily_cap_per_instance, 10) || 0))
        : null,
      cadence_enabled: form.cadence_enabled,
    });
    setSaving(false);

    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    toast.success("Salvo");
    router.refresh();
  }

  async function handleStart() {
    if (
      !confirm(
        `Iniciar campanha "${campaign.name}"? Vai disparar a saudação inicial pra todos os leads (status scraped/enriched).\n\nO agente IA conduz a conversa daí em diante até confirmar a presença.`,
      )
    )
      return;
    setSaving(true);
    const result = await startCampaign(campaign.id);
    setSaving(false);
    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    toast.success(
      `Campanha ativada. ${result.scheduled} saudações iniciais agendadas (cron dispara com jitter 3-7 min entre cada).`,
    );
    router.refresh();
  }

  async function handlePause() {
    if (
      !confirm(
        `Pausar campanha "${campaign.name}"?\n\nNenhuma mensagem nova será disparada (initial outreach + cadências de lembrete ficam em standby). Conversas em andamento com o agente IA CONTINUAM funcionando.\n\nQuando retomar, o sistema pega o backlog de onde parou.`,
      )
    )
      return;
    setSaving(true);
    const result = await pauseCampaign(campaign.id);
    setSaving(false);
    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    toast.success("Campanha pausada. Disparos em standby.");
    router.refresh();
  }

  async function handleResume() {
    setSaving(true);
    const result = await resumeCampaign(campaign.id);
    setSaving(false);
    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    if ((result.pendingCount ?? 0) > 0) {
      toast.success(
        `Campanha retomada. ${result.pendingCount} mensagens em backlog vão disparar nos próximos minutos (jitter 4-9min por chip).`,
      );
    } else {
      toast.success("Campanha retomada.");
    }
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Excluir campanha "${campaign.name}" permanentemente?`)) return;
    const result = await deleteCampaign(campaign.id);
    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    toast.success("Campanha excluída");
    router.push("/webinar");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="p-6 space-y-6">
        <Section title="Identificação">
          <Field label="Nome interno">
            <Input value={form.name} onChange={update("name")} />
          </Field>
          <Field label="Tema">
            <Input
              value={form.theme}
              onChange={update("theme")}
              placeholder="4 Pilares Para Seu Petshop e Clínica..."
            />
          </Field>
          <Field label="Descrição">
            <textarea
              value={form.description}
              onChange={update("description")}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
            />
          </Field>
        </Section>

        <Section title="Evento">
          <Field label="Data e hora">
            <Input
              type="datetime-local"
              value={form.event_date}
              onChange={update("event_date")}
            />
          </Field>
          <Field label="Link Google Meet">
            <Input
              type="url"
              value={form.meet_link}
              onChange={update("meet_link")}
              placeholder="https://meet.google.com/..."
            />
          </Field>
        </Section>

        <Section title="Oferta pós-webinar">
          <Field label="Descrição da oferta">
            <Input
              value={form.offer_description}
              onChange={update("offer_description")}
              placeholder="Call de diagnóstico gratuito 30 min"
            />
          </Field>
          <Field label="Link Cal.com">
            <Input
              type="url"
              value={form.cal_link}
              onChange={update("cal_link")}
              placeholder="https://cal.com/..."
            />
          </Field>
        </Section>

        <Section title="Validação de WhatsApp (qualidade da base)">
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-800">
                  Filtra leads sem WhatsApp antes do disparo
                </div>
                <p className="text-xs text-slate-600 mt-1">
                  Sistema valida cada número via Evolution. Sem WhatsApp = vira "perdido" automaticamente.
                  Roda automaticamente ao final do scrape. Pode forçar manual abaixo.
                </p>
              </div>
            </div>

            {valStats ? (
              <div className="flex items-stretch flex-wrap divide-x divide-emerald-100 rounded-md bg-white border border-emerald-100 mb-3">
                <div className="flex-1 min-w-[110px] p-3">
                  <div className="text-xs font-medium text-slate-500">Total</div>
                  <div className="text-lg font-bold text-slate-800">{valStats.total}</div>
                </div>
                <div className="flex-1 min-w-[110px] p-3">
                  <div className="text-xs font-medium text-emerald-700">Com WhatsApp</div>
                  <div className="text-lg font-bold text-emerald-600">{valStats.com_whatsapp}</div>
                  <div className="text-[11px] text-slate-500">
                    {valStats.total > 0
                      ? `${Math.round((valStats.com_whatsapp / valStats.total) * 100)}%`
                      : "-"}
                  </div>
                </div>
                <div className="flex-1 min-w-[110px] p-3">
                  <div className="text-xs font-medium text-rose-700">Sem WhatsApp</div>
                  <div className="text-lg font-bold text-rose-600">{valStats.sem_whatsapp}</div>
                </div>
                <div className="flex-1 min-w-[110px] p-3">
                  <div className="text-xs font-medium text-amber-700">Aguardando</div>
                  <div className="text-lg font-bold text-amber-600">{valStats.nao_validados}</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic mb-3">Carregando stats...</div>
            )}

            <div className="flex items-center gap-2">
              <Button
                onClick={handleValidateNow}
                disabled={validating || (valStats?.nao_validados ?? 0) === 0}
                variant="outline"
                size="sm"
                className="text-xs"
              >
                {validating ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Validando...</>
                ) : (
                  <><ShieldCheck className="w-3 h-3 mr-1.5" /> Validar agora</>
                )}
              </Button>
              <Button onClick={loadValidationStats} variant="outline" size="sm" className="text-xs">
                <RefreshCw className="w-3 h-3" />
              </Button>
              {valStats && valStats.com_site_enriquecido > 0 && (
                <span className="text-[11px] text-slate-500">
                  {valStats.com_site_enriquecido} enriquecidos via site
                </span>
              )}
            </div>
          </div>
        </Section>

        <Section title="Disparo (multi-instance, rotação anti-ban)">
          <Field
            label="Cadência automática de lembretes"
            hint="Quando ATIVADA, ao confirmar um lead o sistema agenda D-1 (véspera), T-1h, T-10min e nutrição. Quando DESATIVADA (recomendado), o time gerencia os lembretes manualmente. Agente IA continua confirmando e respondendo perguntas normalmente."
          >
            <span className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.cadence_enabled}
                onChange={(e) =>
                  setForm((s) => ({ ...s, cadence_enabled: e.target.checked }))
                }
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-sm">
                {form.cadence_enabled ? (
                  <span className="font-semibold text-emerald-700">
                    Cadência ativa — sistema agenda lembretes automaticamente
                  </span>
                ) : (
                  <span className="font-semibold text-slate-700">
                    Cadência desativada — controle manual (recomendado)
                  </span>
                )}
              </span>
            </span>
          </Field>

          <Field
            label="Cap diário por chip"
            hint="Quantos disparos cada chip pode fazer por dia. Vazio = usa o padrão global (40). Range: 1-1000. Acima de 80/chip aumenta risco de ban — use com cautela."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1000}
                value={form.daily_cap_per_instance}
                onChange={update("daily_cap_per_instance")}
                placeholder="40 (padrão)"
                className="w-32"
              />
              <span className="text-xs text-slate-500">disparos/chip/dia</span>
              {form.daily_cap_per_instance && parseInt(form.daily_cap_per_instance, 10) > 80 && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                  ⚠ alto risco
                </span>
              )}
            </div>
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Marca quais instâncias vão participar da campanha. São rotacionadas aleatoriamente em cada disparo.
              </p>
              <button
                type="button"
                onClick={loadInstances}
                className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                Recarregar
              </button>
            </div>

            {loadingInstances ? (
              <div className="text-center py-6 text-sm text-slate-500">
                Carregando instâncias do Evolution...
              </div>
            ) : instances.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-500">
                Nenhuma instância encontrada no Evolution.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {instances.map((inst) => {
                  const checked = selectedInstances.has(inst.name);
                  const isOpen = inst.connectionStatus === "open";
                  return (
                    <label
                      key={inst.name}
                      className={`flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer ${
                        !isOpen ? "opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleInstance(inst.name)}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-800">
                            {inst.name}
                          </span>
                          {isOpen ? (
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                              <Wifi className="w-3 h-3" />
                              Conectado
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                              <WifiOff className="w-3 h-3" />
                              {inst.connectionStatus}
                            </span>
                          )}
                        </div>
                        {(inst.profileName || inst.ownerJid) && (
                          <div className="text-[11px] text-slate-500 truncate">
                            {inst.profileName ?? "-"}
                            {inst.ownerJid && ` (${inst.ownerJid.split("@")[0]})`}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedInstances.size > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {selectedInstances.size} instância(s) selecionada(s) pra rotação.
                </p>
                <button
                  type="button"
                  onClick={syncWebhooks}
                  disabled={syncingWebhooks}
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50 flex items-center gap-1"
                >
                  <Webhook className="w-3 h-3" />
                  {syncingWebhooks
                    ? "Sincronizando..."
                    : "Realizar configurações no N8N"}
                </button>
              </div>
            )}
          </div>
        </Section>

        <Section title="Prospecção">
          <Field label="Nicho">
            <Input
              value={form.target_nicho}
              onChange={update("target_nicho")}
              placeholder="petshop e clínica veterinária"
            />
          </Field>
          <Field label="Cidades" hint="Separadas por vírgula">
            <Input
              value={form.target_cities}
              onChange={update("target_cities")}
              placeholder="são paulo, campinas, santos"
            />
          </Field>
        </Section>

        <div className="flex justify-between pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={remove} className="text-rose-600 hover:text-rose-700 hover:bg-rose-50">
            Excluir campanha
          </Button>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={save}
              disabled={saving}
              variant="outline"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>

            {campaign.status === "active" && (
              <Button
                onClick={handlePause}
                disabled={saving}
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                <Pause className="w-4 h-4 mr-2" />
                Pausar campanha
              </Button>
            )}

            {campaign.status === "paused" && (
              <Button
                onClick={handleResume}
                disabled={saving}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Play className="w-4 h-4 mr-2" />
                Retomar campanha
              </Button>
            )}

            {campaign.status !== "paused" && (
              <Button
                onClick={handleStart}
                disabled={saving || campaign.status === "active"}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Play className="w-4 h-4 mr-2" />
                {campaign.status === "active" ? "Campanha ativa" : "Iniciar campanha"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
