"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    Search, Sparkles, Plus, Trash2, Check, FileText, Loader2,
    Building2, MapPin, Tag, MessageSquare, AlertTriangle, ClipboardList, Upload,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Badge } from "@/components/ui/simple-ui";
import { EmptyState } from "@/components/ui/empty-state";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
    addLead, importLeads, enrichLead, updateMensagem, setLeadStatus, deleteLead,
    type ProspeccaoLead,
} from "./actions";

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline" }> = {
    novo: { label: "Novo", variant: "secondary" },
    pesquisando: { label: "Pesquisando", variant: "warning" },
    pronto: { label: "Dossiê pronto", variant: "default" },
    aprovado: { label: "Aprovado", variant: "success" },
    erro: { label: "Erro", variant: "destructive" },
};

export default function ProspeccaoClient({ initialLeads }: { initialLeads: ProspeccaoLead[] }) {
    const router = useRouter();
    const leads = initialLeads;
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [addOpen, setAddOpen] = React.useState(false);
    const [dossieId, setDossieId] = React.useState<string | null>(null);

    const dossieLead = leads.find((l) => l.id === dossieId) || null;

    const total = leads.length;
    const prontos = leads.filter((l) => l.status === "pronto").length;
    const aprovados = leads.filter((l) => l.status === "aprovado").length;

    async function handleEnrich(id: string) {
        setBusyId(id);
        try {
            const r = await enrichLead(id);
            if (r.success) toast.success("Dossiê gerado.");
            else toast.error(r.error || "Falha ao pesquisar.");
        } finally {
            setBusyId(null);
            router.refresh();
        }
    }

    async function handleDelete(id: string) {
        if (!confirm("Remover este lead da prospecção?")) return;
        setBusyId(id);
        try {
            const r = await deleteLead(id);
            if (!r.success) toast.error(r.error || "Falha ao remover.");
        } finally {
            setBusyId(null);
            router.refresh();
        }
    }

    async function handleApprove(id: string) {
        setBusyId(id);
        try {
            const r = await setLeadStatus(id, "aprovado");
            if (r.success) toast.success("Lead aprovado. Pronto pra abordagem.");
            else toast.error(r.error || "Falha ao aprovar.");
        } finally {
            setBusyId(null);
            setDossieId(null);
            router.refresh();
        }
    }

    return (
        <div className="mx-auto max-w-5xl px-4 py-6">
            <PageHeader
                title="Prospecção Inteligente"
                description="Antes de abordar, o sistema pesquisa a empresa (CNPJ, sócios, site) e monta um dossiê com observações reais e a primeira mensagem."
                icon={<Sparkles className="w-5 h-5" />}
                actions={
                    <>
                        <Button variant="outline" asChild>
                            <Link href="/prospeccao/importar"><Upload /> Importar planilha</Link>
                        </Button>
                        <Button onClick={() => setAddOpen(true)}>
                            <Plus /> Adicionar leads
                        </Button>
                    </>
                }
            />

            {/* Faixa de stats com divisores (padrao DESIGN.md) */}
            <div className="flex items-stretch divide-x divide-slate-200 rounded-xl border border-slate-200 bg-white mb-6">
                <Stat label="Leads na fila" value={total} />
                <Stat label="Dossiês prontos" value={prontos} />
                <Stat label="Aprovados" value={aprovados} />
            </div>

            {leads.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white">
                    <EmptyState
                        icon={ClipboardList}
                        title="Nenhum lead ainda"
                        description="Adicione empresas com CNPJ ou site e o sistema gera o dossiê de cada uma."
                        action={<Button onClick={() => setAddOpen(true)}><Plus /> Adicionar leads</Button>}
                    />
                </div>
            ) : (
                <ul className="space-y-2">
                    {leads.map((lead) => {
                        const meta = STATUS_META[lead.status] || STATUS_META.novo;
                        const busy = busyId === lead.id || lead.status === "pesquisando";
                        return (
                            <li key={lead.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                    <Building2 className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-slate-800 truncate">{lead.empresa}</span>
                                        <Badge variant={meta.variant}>{meta.label}</Badge>
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                                        {lead.cidade && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{lead.cidade}</span>}
                                        {lead.nicho && <span className="inline-flex items-center gap-1"><Tag className="w-3.5 h-3.5" />{lead.nicho}</span>}
                                        {lead.socio && <span>Sócio: {lead.socio}</span>}
                                        {lead.status === "erro" && lead.erro && (
                                            <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle className="w-3.5 h-3.5" />{lead.erro}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {(lead.status === "pronto" || lead.status === "aprovado") && (
                                        <Button variant="outline" size="sm" onClick={() => setDossieId(lead.id)}>
                                            <FileText /> Ver dossiê
                                        </Button>
                                    )}
                                    {lead.status !== "aprovado" && (
                                        <Button variant={lead.status === "pronto" ? "secondary" : "default"} size="sm" disabled={busy} onClick={() => handleEnrich(lead.id)}>
                                            {busy ? <Loader2 className="animate-spin" /> : <Search />}
                                            {lead.status === "pronto" || lead.status === "erro" ? "Refazer" : "Pesquisar"}
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="icon-sm" aria-label="Remover" disabled={busy} onClick={() => handleDelete(lead.id)}>
                                        <Trash2 />
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <AddLeadsDialog open={addOpen} onOpenChange={setAddOpen} onDone={() => router.refresh()} />
            <DossieDialog lead={dossieLead} onClose={() => setDossieId(null)} onApprove={handleApprove} onSaved={() => router.refresh()} busy={busyId === dossieId} />
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex-1 px-5 py-4">
            <div className="text-2xl font-bold text-slate-900">{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
        </div>
    );
}

function AddLeadsDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
    const [mode, setMode] = React.useState<"um" | "lista">("um");
    const [saving, setSaving] = React.useState(false);
    const [form, setForm] = React.useState({ empresa: "", cnpj: "", site: "", cidade: "", nicho: "", telefone: "", instagram: "" });
    const [lista, setLista] = React.useState("");

    function reset() {
        setForm({ empresa: "", cnpj: "", site: "", cidade: "", nicho: "", telefone: "", instagram: "" });
        setLista("");
    }

    async function submit() {
        setSaving(true);
        try {
            if (mode === "um") {
                if (!form.empresa.trim()) { toast.error("Informe o nome da empresa."); return; }
                const r = await addLead(form);
                if (r.success) { toast.success("Lead adicionado."); reset(); onOpenChange(false); onDone(); }
                else toast.error(r.error || "Falha ao adicionar.");
            } else {
                const r = await importLeads(lista);
                if (r.success) { toast.success(`${r.total} lead(s) importado(s).`); reset(); onOpenChange(false); onDone(); }
                else toast.error(r.error || "Falha ao importar.");
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white max-w-lg">
                <DialogHeader>
                    <DialogTitle>Adicionar leads</DialogTitle>
                    <DialogDescription>Empresas que você quer prospectar. Quanto mais dado (CNPJ e site), melhor o dossiê.</DialogDescription>
                </DialogHeader>

                <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
                    <button className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === "um" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("um")}>Uma empresa</button>
                    <button className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === "lista" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`} onClick={() => setMode("lista")}>Colar lista</button>
                </div>

                {mode === "um" ? (
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Empresa *" className="col-span-2"><Input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder="Nome da empresa" /></Field>
                        <Field label="CNPJ"><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" /></Field>
                        <Field label="Telefone"><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(31) 90000-0000" /></Field>
                        <Field label="Site" className="col-span-2"><Input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} placeholder="https://..." /></Field>
                        <Field label="Cidade"><Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade" /></Field>
                        <Field label="Nicho"><Input value={form.nicho} onChange={(e) => setForm({ ...form, nicho: e.target.value })} placeholder="Segmento" /></Field>
                        <Field label="Instagram" className="col-span-2"><Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@perfil" /></Field>
                    </div>
                ) : (
                    <div>
                        <Textarea value={lista} onChange={(e) => setLista(e.target.value)} rows={7} placeholder={"Uma empresa por linha, campos separados por ponto e vírgula:\nempresa;cnpj;site;cidade;nicho;telefone"} />
                        <p className="mt-1.5 text-xs text-slate-500">Só o nome da empresa é obrigatório. Ordem: empresa;cnpj;site;cidade;nicho;telefone</p>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Plus />} Adicionar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DossieDialog({ lead, onClose, onApprove, onSaved, busy }: {
    lead: ProspeccaoLead | null;
    onClose: () => void;
    onApprove: (id: string) => void;
    onSaved: () => void;
    busy: boolean;
}) {
    const [mensagem, setMensagem] = React.useState("");
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        setMensagem(lead?.dossie?.mensagem_1 || "");
    }, [lead?.id, lead?.dossie?.mensagem_1]);

    if (!lead) return null;
    const d = lead.dossie;

    async function salvar() {
        if (!lead) return;
        setSaving(true);
        try {
            const r = await updateMensagem(lead.id, mensagem);
            if (r.success) { toast.success("Mensagem salva."); onSaved(); }
            else toast.error(r.error || "Falha ao salvar.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={!!lead} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{lead.empresa}</DialogTitle>
                    <DialogDescription>
                        {lead.socio ? `Sócio: ${lead.socio} · ` : ""}{lead.nicho || ""}{lead.cidade ? ` · ${lead.cidade}` : ""}
                    </DialogDescription>
                </DialogHeader>

                {!d ? (
                    <p className="text-sm text-slate-500">Dossiê ainda não gerado.</p>
                ) : (
                    <div className="space-y-4">
                        <section>
                            <h4 className="text-sm font-semibold text-slate-800 mb-2">O que observamos</h4>
                            <ol className="space-y-2">
                                {d.observacoes.map((o, i) => (
                                    <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                                        <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                        <span>{o}</span>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        {d.dor && (
                            <section className="rounded-lg bg-rose-50 border border-rose-100 p-3">
                                <div className="text-xs font-semibold text-rose-700 mb-1">Dor provável</div>
                                <p className="text-sm text-rose-900">{d.dor}</p>
                            </section>
                        )}

                        {d.insight_gratis && (
                            <section className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                                <div className="text-xs font-semibold text-emerald-700 mb-1">Insight pra dar de graça</div>
                                <p className="text-sm text-emerald-900">{d.insight_gratis}</p>
                            </section>
                        )}

                        <section>
                            <div className="flex items-center gap-2 mb-2">
                                <MessageSquare className="w-4 h-4 text-slate-500" />
                                <h4 className="text-sm font-semibold text-slate-800">Primeira mensagem</h4>
                                <span className="text-xs text-slate-400">{mensagem.length} caracteres</span>
                            </div>
                            <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} />
                            <div className="mt-2 flex justify-end">
                                <Button variant="outline" size="sm" onClick={salvar} disabled={saving || mensagem === (d.mensagem_1 || "")}>
                                    {saving ? <Loader2 className="animate-spin" /> : <Check />} Salvar mensagem
                                </Button>
                            </div>
                        </section>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Fechar</Button>
                    {lead.status !== "aprovado" && (
                        <Button variant="success" onClick={() => onApprove(lead.id)} disabled={busy}>
                            {busy ? <Loader2 className="animate-spin" /> : <Check />} Aprovar pra abordagem
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <label className={`flex flex-col gap-1.5 ${className || ""}`}>
            <span className="text-xs font-medium text-slate-600">{label}</span>
            {children}
        </label>
    );
}
