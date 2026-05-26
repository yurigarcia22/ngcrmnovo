"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui/simple-ui";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Megaphone, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createCampaign, listWebinarInstances } from "@/app/actions-webinar";

interface AvailableInstance {
  instance_name: string;
  custom_name: string | null;
  status: string;
  purpose: string;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [instances, setInstances] = useState<AvailableInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(true);

  useEffect(() => {
    listWebinarInstances().then((res) => {
      if (res.success && res.data) setInstances(res.data);
      setInstancesLoading(false);
    });
  }, []);

  const [form, setForm] = useState({
    name: "",
    theme: "",
    description: "",
    event_date: "",
    meet_link: "",
    offer_description: "",
    cal_link: "",
    instance_name: "",
    target_nicho: "",
    target_cities: "",
  });

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Nome interno da campanha é obrigatório");
      return;
    }

    setLoading(true);
    const result = await createCampaign({
      name: form.name.trim(),
      theme: form.theme.trim() || null,
      description: form.description.trim() || null,
      event_date: form.event_date ? new Date(form.event_date).toISOString() : null,
      meet_link: form.meet_link.trim() || null,
      offer_description: form.offer_description.trim() || null,
      cal_link: form.cal_link.trim() || null,
      instance_name: form.instance_name.trim() || null,
      target_nicho: form.target_nicho.trim() || null,
      target_cities: form.target_cities
        ? form.target_cities.split(",").map((c) => c.trim()).filter(Boolean)
        : null,
    });
    setLoading(false);

    if (!result.success) {
      toast.error(`Erro: ${result.error}`);
      return;
    }

    toast.success("Campanha criada");
    router.push(`/webinar/${result.data!.id}`);
  }

  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-center gap-3">
        <Link
          href="/webinar"
          className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <Megaphone className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nova Campanha</h1>
          <p className="text-sm text-slate-500">
            Cria a estrutura agora. Tema, leads e cadência podem ficar pra depois.
          </p>
        </div>
      </div>

      <Card className="p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Identificação" subtitle="Como tu vai chamar essa campanha">
            <Field label="Nome interno *" hint="Ex: Petshop SP - Maio/2026">
              <Input
                value={form.name}
                onChange={update("name")}
                placeholder="Petshop SP - Maio/2026"
                required
              />
            </Field>

            <Field label="Tema do webinar" hint="Headline pra usar nos convites">
              <Input
                value={form.theme}
                onChange={update("theme")}
                placeholder="4 Pilares Para Seu Petshop e Clínica Faturarem Mais"
              />
            </Field>

            <Field label="Descrição interna" hint="Notas internas, objetivos">
              <textarea
                value={form.description}
                onChange={update("description")}
                placeholder="Objetivos, observações..."
                rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
              />
            </Field>
          </Section>

          <Section title="Evento" subtitle="Data e link do Google Meet">
            <Field label="Data e hora do webinar" hint="Pode preencher depois">
              <Input
                type="datetime-local"
                value={form.event_date}
                onChange={update("event_date")}
              />
            </Field>

            <Field
              label="Link do Google Meet"
              hint="Cria um evento no Google Calendar e cola aqui"
            >
              <Input
                type="url"
                value={form.meet_link}
                onChange={update("meet_link")}
                placeholder="https://meet.google.com/abc-defg-hij"
              />
            </Field>
          </Section>

          <Section title="Oferta pós-webinar" subtitle="O que oferece no fim do evento">
            <Field label="Descrição da oferta" hint="Ex: call de diagnóstico de 30 min">
              <Input
                value={form.offer_description}
                onChange={update("offer_description")}
                placeholder="Call de diagnóstico gratuito de 30 minutos"
              />
            </Field>

            <Field label="Link Cal.com" hint="Pra leads agendarem o diagnóstico">
              <Input
                type="url"
                value={form.cal_link}
                onChange={update("cal_link")}
                placeholder="https://cal.com/yuri-garcia/diagnostico"
              />
            </Field>
          </Section>

          <Section title="Disparo" subtitle="Qual chip vai mandar as mensagens">
            <Field
              label="Instância WhatsApp"
              hint="Apenas instâncias cadastradas no CRM aparecem aqui. Crie em Configurações → WhatsApp e marque como disponível para Webinar."
            >
              {instancesLoading ? (
                <div className="text-sm text-slate-400">Carregando instâncias...</div>
              ) : instances.length === 0 ? (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Nenhuma instância disponível.</strong>
                    <p className="text-xs mt-0.5">
                      Vá em <Link href="/settings/whatsapp" className="underline font-semibold">Configurações → WhatsApp</Link>, conecte uma instância e marque ela como "Webinar" ou "Ambos".
                    </p>
                  </div>
                </div>
              ) : (
                <select
                  value={form.instance_name}
                  onChange={(e) => setForm((s) => ({ ...s, instance_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                >
                  <option value="">— Selecione —</option>
                  {instances.map((i) => (
                    <option key={i.instance_name} value={i.instance_name}>
                      {i.custom_name ?? i.instance_name}
                      {i.status !== "connected" ? `  (${i.status})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </Section>

          <Section title="Prospecção" subtitle="Configuração do scraper">
            <Field label="Nicho" hint="Ex: petshop e clínica veterinária">
              <Input
                value={form.target_nicho}
                onChange={update("target_nicho")}
                placeholder="petshop e clínica veterinária"
              />
            </Field>

            <Field
              label="Cidades"
              hint="Separa por vírgula. Ex: são paulo, campinas, santos"
            >
              <Input
                value={form.target_cities}
                onChange={update("target_cities")}
                placeholder="são paulo, campinas, santos"
              />
            </Field>
          </Section>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Link href="/webinar">
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={loading}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              {loading ? "Criando..." : "Criar campanha"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
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
