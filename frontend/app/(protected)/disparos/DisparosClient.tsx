"use client";

import { useState } from "react";
import {
    Send, Plus, Play, Pause, Trash2, Users, Upload, Clock, ArrowLeft,
    Loader2, Check, Megaphone, AlertTriangle, Smartphone,
} from "lucide-react";
import { createCampaign, setCampaignStatus, deleteCampaign } from "./actions";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface Instance { instance_name: string; custom_name?: string; phone_number?: string; status: string; }
interface Campaign {
    id: string; name: string; instance_name: string; status: string;
    interval_min_sec: number; interval_max_sec: number; daily_cap: number;
    total: number; sent: number; failed: number; pending: number;
}

const STATUS: Record<string, { t: string; cls: string }> = {
    draft: { t: "Rascunho", cls: "bg-slate-100 text-slate-600" },
    running: { t: "Disparando", cls: "bg-emerald-50 text-emerald-700" },
    paused: { t: "Pausada", cls: "bg-amber-50 text-amber-700" },
    done: { t: "Concluída", cls: "bg-sky-50 text-sky-700" },
};

export default function DisparosClient({ initialCampaigns, instances }: { initialCampaigns: Campaign[]; instances: Instance[] }) {
    const confirm = useConfirm();
    const [view, setView] = useState<"list" | "new">(initialCampaigns.length ? "list" : "new");
    const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);

    const connected = instances.filter((i) => i.status === "connected");

    async function toggle(c: Campaign) {
        const next = c.status === "running" ? "paused" : "running";
        setCampaigns((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
        const res = await setCampaignStatus(c.id, next as any);
        if (!res.success) { toast.error(res.error ?? "Erro"); window.location.reload(); }
        else toast.success(next === "running" ? "Disparo iniciado" : "Disparo pausado");
    }

    async function remove(c: Campaign) {
        const ok = await confirm({ title: "Excluir campanha?", description: "Os destinatários e o progresso serão apagados.", tone: "danger", confirmText: "Excluir" });
        if (!ok) return;
        setCampaigns((cs) => cs.filter((x) => x.id !== c.id));
        await deleteCampaign(c.id);
    }

    return (
        <div className="mx-auto max-w-5xl px-5 py-7 md:px-8">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Megaphone className="text-indigo-600" />
                    <h1 className="text-2xl font-bold text-slate-800">Disparos</h1>
                </div>
                {view === "list" ? (
                    <button onClick={() => setView("new")} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                        <Plus size={17} /> Nova campanha
                    </button>
                ) : (
                    <button onClick={() => setView("list")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-800">
                        <ArrowLeft size={16} /> Voltar
                    </button>
                )}
            </div>

            {view === "new" ? (
                <NewCampaign connected={connected} onCreated={() => window.location.reload()} />
            ) : campaigns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center">
                    <Send className="mx-auto mb-3 text-slate-300" size={32} />
                    <p className="font-semibold text-slate-700">Nenhuma campanha ainda</p>
                    <button onClick={() => setView("new")} className="mt-3 text-indigo-600 font-semibold hover:underline">Criar a primeira</button>
                </div>
            ) : (
                <div className="space-y-3">
                    {campaigns.map((c) => {
                        const st = STATUS[c.status] ?? STATUS.draft;
                        const pct = c.total ? Math.round((c.sent / c.total) * 100) : 0;
                        return (
                            <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-slate-800 truncate">{c.name}</h3>
                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.t}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                                            <Smartphone size={12} /> {c.instance_name} · intervalo {c.interval_min_sec}-{c.interval_max_sec}s · cap {c.daily_cap}/dia
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {(c.status === "running" || c.status === "paused" || c.status === "draft") && c.pending > 0 && (
                                            <button onClick={() => toggle(c)} aria-label={c.status === "running" ? "Pausar" : "Iniciar"}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 ${c.status === "running" ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                                                {c.status === "running" ? <><Pause size={13} /> Pausar</> : <><Play size={13} /> Iniciar</>}
                                            </button>
                                        )}
                                        <button onClick={() => remove(c)} aria-label="Excluir" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                                    </div>
                                </div>
                                <div className="mt-3">
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-4 text-[12px] text-slate-500">
                                        <span><b className="text-slate-800">{c.sent}</b>/{c.total} enviados</span>
                                        <span>{c.pending} pendentes</span>
                                        {c.failed > 0 && <span className="text-rose-600">{c.failed} falhas</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function NewCampaign({ connected, onCreated }: { connected: Instance[]; onCreated: () => void }) {
    const [name, setName] = useState("");
    const [instanceName, setInstanceName] = useState(connected[0]?.instance_name ?? "");
    const [recipients, setRecipients] = useState("");
    const [messages, setMessages] = useState<string[]>([""]);
    const [intervalMin, setIntervalMin] = useState(40);
    const [intervalMax, setIntervalMax] = useState(120);
    const [dailyCap, setDailyCap] = useState(200);
    const [businessHours, setBusinessHours] = useState(true);
    const [saving, setSaving] = useState(false);

    const lineCount = recipients.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;

    function loadFile(file: File) {
        const reader = new FileReader();
        reader.onload = () => setRecipients((prev) => (prev ? prev + "\n" : "") + String(reader.result || ""));
        reader.readAsText(file);
    }

    async function submit() {
        if (connected.length === 0) { toast.error("Nenhum número conectado. Conecte um WhatsApp em Configurações."); return; }
        setSaving(true);
        const res = await createCampaign({
            name, instanceName, messages, intervalMinSec: intervalMin, intervalMaxSec: intervalMax,
            dailyCap, businessHoursOnly: businessHours, recipientsRaw: recipients,
        });
        setSaving(false);
        if (res.success) {
            toast.success(`Campanha criada: ${res.total} contatos${res.invalid ? `, ${res.invalid} inválidos` : ""}${res.duplicates ? `, ${res.duplicates} duplicados` : ""}`);
            onCreated();
        } else {
            toast.error(res.error ?? "Erro ao criar campanha.");
        }
    }

    return (
        <div className="space-y-5">
            {connected.length === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                    <AlertTriangle size={16} /> Nenhum número conectado. Conecte um WhatsApp em Configurações → Conexões antes de disparar.
                </div>
            )}

            <Field label="Nome da campanha">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Promoção vacinação junho" className="inp" />
            </Field>

            <Field label="Número que vai disparar">
                <select value={instanceName} onChange={(e) => setInstanceName(e.target.value)} className="inp bg-white">
                    {connected.length === 0 && <option value="">— nenhum conectado —</option>}
                    {connected.map((i) => (
                        <option key={i.instance_name} value={i.instance_name}>{i.custom_name || i.instance_name} {i.phone_number ? `(+${i.phone_number})` : ""}</option>
                    ))}
                </select>
            </Field>

            <Field label={`Contatos (um por linha: nome;telefone) — ${lineCount} linha(s)`}>
                <textarea value={recipients} onChange={(e) => setRecipients(e.target.value)} rows={6}
                    placeholder={"Maria;5531999990000\nJoão;5531988887777\n5531977776666"}
                    className="inp font-mono text-[13px] resize-y" />
                <label className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 cursor-pointer hover:text-indigo-800">
                    <Upload size={14} /> Importar CSV / TXT
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ""; }} />
                </label>
            </Field>

            <Field label="Mensagens (use {nome}; até 3 variações — o sistema sorteia uma, reduz bloqueio)">
                <div className="space-y-2">
                    {messages.map((m, i) => (
                        <textarea key={i} value={m} onChange={(e) => setMessages((ms) => ms.map((x, j) => (j === i ? e.target.value : x)))} rows={2}
                            placeholder={i === 0 ? "Oi {nome}! Tudo bem? ..." : "Variação " + (i + 1)} className="inp resize-y" />
                    ))}
                    {messages.length < 3 && (
                        <button onClick={() => setMessages((ms) => [...ms, ""])} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"><Plus size={13} /> Adicionar variação</button>
                    )}
                </div>
            </Field>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Intervalo mín (s)"><input type="number" value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} className="inp" /></Field>
                <Field label="Intervalo máx (s)"><input type="number" value={intervalMax} onChange={(e) => setIntervalMax(Number(e.target.value))} className="inp" /></Field>
                <Field label="Cap diário"><input type="number" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} className="inp" /></Field>
                <label className="flex items-end gap-2 text-sm text-slate-600 pb-2">
                    <input type="checkbox" checked={businessHours} onChange={(e) => setBusinessHours(e.target.checked)} /> Só 8h-20h
                </label>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-slate-500">
                <Clock size={14} /> A campanha é criada como rascunho. Clique em <b className="text-slate-700">Iniciar</b> na lista pra começar a disparar (precisa do cron de disparo agendado).
            </div>

            <button onClick={submit} disabled={saving || connected.length === 0} className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Criar campanha
            </button>

            <style jsx>{`.inp{width:100%;padding:0.55rem 0.7rem;border:1px solid #e2e8f0;border-radius:0.6rem;font-size:0.875rem;color:#1e293b;outline:none}.inp:focus{box-shadow:0 0 0 2px #c7d2fe}`}</style>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>
            {children}
        </div>
    );
}
