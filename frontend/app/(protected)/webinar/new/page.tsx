"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@/components/ui/simple-ui";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { createCampaign } from "@/app/actions-webinar";

export default function NewCampaignPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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
      toast.error("Nome interno da campanha e obrigatorio");
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
            Cria a estrutura agora. Tema, leads e cadencia podem ficar pra depois.
          </p>
        </div>
      </div>

      <Card className="p-6 max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Identificacao" subtitle="Como tu vai chamar essa campanha">
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
                placeholder="4 Pilares Para Seu Petshop e Clinica Faturarem Mais"
              />
            </Field>

            <Field label="Descricao interna" hint="Notas internas, objetivos">
              <textarea
                value={form.description}
                onChange={update("description")}
                placeholder="Objetivos, observacoes..."
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

          <Section title="Oferta pos-webinar" subtitle="O que oferece no fim do evento">
            <Field label="Descricao da oferta" hint="Ex: call de diagnostico de 30 min">
              <Input
                value={form.offer_description}
                onChange={update("offer_description")}
                placeholder="Call de diagnostico gratuito de 30 minutos"
              />
            </Field>

            <Field label="Link Cal.com" hint="Pra leads agendarem o diagnostico">
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
              label="Instance Evolution"
              hint="Nome exato da instance no Evolution (ex: TIM - WEBINAR, INSTA-AUTOMATIC)"
            >
              <Input
                value={form.instance_name}
                onChange={update("instance_name")}
                placeholder="INSTA-AUTOMATIC"
              />
            </Field>
          </Section>

          <Section title="Prospeccao" subtitle="Configuracao do scraper">
            <Field label="Nicho" hint="Ex: petshop e clinica veterinaria">
              <Input
                value={form.target_nicho}
                onChange={update("target_nicho")}
                placeholder="petshop e clinica veterinaria"
              />
            </Field>

            <Field
              label="Cidades"
              hint="Separa por virgula. Ex: sao paulo, campinas, santos"
            >
              <Input
                value={form.target_cities}
                onChange={update("target_cities")}
                placeholder="sao paulo, campinas, santos"
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
