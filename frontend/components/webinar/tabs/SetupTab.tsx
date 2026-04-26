"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui/simple-ui";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Play, Wifi, WifiOff, RefreshCw } from "lucide-react";
import {
  updateCampaign,
  deleteCampaign,
  startCampaign,
} from "@/app/actions-webinar";
import { listAvailableInstances } from "@/app/actions-evolution";
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
  });

  const initialSelected = new Set([
    ...(campaign.instance_names ?? []),
    ...(campaign.instance_name ? [campaign.instance_name] : []),
  ]);
  const [selectedInstances, setSelectedInstances] = useState<Set<string>>(initialSelected);
  const [instances, setInstances] = useState<EvoInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);

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
    if (!confirm(`Iniciar campanha "${campaign.name}"? Vai criar mensagens agendadas pra todos os leads.`)) return;
    setSaving(true);
    const result = await startCampaign(campaign.id);
    setSaving(false);
    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }
    toast.success(
      `Campanha iniciada. Cadência ${result.cadence}, ${result.scheduled} mensagens agendadas.`,
    );
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

        <Section title="Disparo (multi-instance, rotação anti-ban)">
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
              <div className="text-center py-6 text-sm text-slate-400">
                Carregando instâncias do Evolution...
              </div>
            ) : instances.length === 0 ? (
              <div className="text-center py-6 text-sm text-slate-400">
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
              <p className="text-xs text-slate-500">
                {selectedInstances.size} instância(s) selecionada(s) pra rotação.
              </p>
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
          <div className="flex gap-2">
            <Button
              onClick={save}
              disabled={saving}
              variant="outline"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
            <Button
              onClick={handleStart}
              disabled={saving || campaign.status === "active"}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Play className="w-4 h-4 mr-2" />
              {campaign.status === "active" ? "Campanha ativa" : "Iniciar campanha"}
            </Button>
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
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-700">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
