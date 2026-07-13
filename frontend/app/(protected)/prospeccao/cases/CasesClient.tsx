"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trophy, Pencil, Trash2, Loader2, Check, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Badge } from "@/components/ui/simple-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { saveCase, toggleCase, deleteCase, type ProspeccaoCase, type CaseInput } from "../actions";

const VAZIO: CaseInput = { nicho: "", cliente: "", cliente_publico: true, headline: "", metrica: "dos interessados viraram cliente", valor_antes: "", valor_depois: "", prazo: "", o_que_fizemos: "", ativo: true };

export default function CasesClient({ initialCases }: { initialCases: ProspeccaoCase[] }) {
    const router = useRouter();
    const cases = initialCases;
    const [editing, setEditing] = React.useState<CaseInput | null>(null);
    const [busyId, setBusyId] = React.useState<string | null>(null);

    async function onToggle(c: ProspeccaoCase) {
        setBusyId(c.id);
        try {
            const r = await toggleCase(c.id, !c.ativo);
            if (!r.success) toast.error(r.error || "Falha.");
        } finally { setBusyId(null); router.refresh(); }
    }

    async function onDelete(id: string) {
        if (!confirm("Remover este case?")) return;
        setBusyId(id);
        try {
            const r = await deleteCase(id);
            if (!r.success) toast.error(r.error || "Falha ao remover.");
        } finally { setBusyId(null); router.refresh(); }
    }

    return (
        <div className="mx-auto max-w-4xl px-4 py-6">
            <div className="mb-4">
                <Link href="/prospeccao" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                    <ArrowLeft className="w-4 h-4" /> Voltar pra Prospecção
                </Link>
            </div>
            <PageHeader
                title="Cases de sucesso"
                description="Resultados reais que a gente entregou. O diagnóstico puxa automaticamente o case do mesmo nicho do lead e mostra como prova no PDF. Só números reais aqui."
                icon={<Trophy className="w-5 h-5" />}
                actions={<Button onClick={() => setEditing({ ...VAZIO })}><Plus /> Novo case</Button>}
            />

            {cases.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white">
                    <EmptyState icon={Trophy} title="Nenhum case ainda" description="Cadastre seus resultados (ex: de 5% pra 26% de conversão) pra usar como prova nos diagnósticos." action={<Button onClick={() => setEditing({ ...VAZIO })}><Plus /> Novo case</Button>} />
                </div>
            ) : (
                <ul className="space-y-2">
                    {cases.map((c) => {
                        const busy = busyId === c.id;
                        return (
                            <li key={c.id} className={`rounded-xl border p-4 flex items-start gap-4 ${c.ativo ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"}`}>
                                <div className="w-11 h-11 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                    <Trophy className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-slate-800">{c.headline}</span>
                                        <Badge variant="secondary">{c.nicho}</Badge>
                                        {!c.ativo && <Badge variant="outline">inativo</Badge>}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-600">
                                        {(c.valor_antes || c.valor_depois) && (
                                            <span className="font-medium text-emerald-700">{c.valor_antes} → {c.valor_depois}</span>
                                        )}
                                        {c.metrica && <span className="text-slate-500"> {c.metrica}</span>}
                                        {c.prazo && <span className="text-slate-400"> · {c.prazo}</span>}
                                    </div>
                                    <div className="mt-0.5 text-xs text-slate-500">
                                        {c.cliente_publico && c.cliente ? `Cliente: ${c.cliente}` : "Cliente anônimo no PDF"}
                                        {c.o_que_fizemos ? ` · ${c.o_que_fizemos}` : ""}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button variant="ghost" size="icon-sm" aria-label={c.ativo ? "Desativar" : "Ativar"} disabled={busy} onClick={() => onToggle(c)}>
                                        {busy ? <Loader2 className="animate-spin" /> : c.ativo ? <Eye /> : <EyeOff />}
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" aria-label="Editar" onClick={() => setEditing({ id: c.id, nicho: c.nicho, cliente: c.cliente || "", cliente_publico: c.cliente_publico, headline: c.headline, metrica: c.metrica, valor_antes: c.valor_antes || "", valor_depois: c.valor_depois || "", prazo: c.prazo || "", o_que_fizemos: c.o_que_fizemos || "", ativo: c.ativo })}>
                                        <Pencil />
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" aria-label="Remover" disabled={busy} onClick={() => onDelete(c.id)}>
                                        <Trash2 />
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <CaseDialog value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />
        </div>
    );
}

function CaseDialog({ value, onClose, onSaved }: { value: CaseInput | null; onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = React.useState<CaseInput>(value || VAZIO);
    const [saving, setSaving] = React.useState(false);
    React.useEffect(() => { if (value) setForm(value); }, [value]);
    if (!value) return null;

    async function submit() {
        setSaving(true);
        try {
            const r = await saveCase(form);
            if (r.success) { toast.success("Case salvo."); onSaved(); }
            else toast.error(r.error || "Falha ao salvar.");
        } finally { setSaving(false); }
    }

    return (
        <Dialog open={!!value} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="bg-white max-w-lg max-h-[88vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{form.id ? "Editar case" : "Novo case"}</DialogTitle>
                    <DialogDescription>Use só números reais. É isso que vira prova no diagnóstico do lead.</DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Nicho *" hint="ex: educacao, saude, varejo" className="col-span-2">
                        <Input value={form.nicho} onChange={(e) => setForm({ ...form, nicho: e.target.value })} placeholder="educacao" />
                    </Field>
                    <Field label="Resultado em uma frase *" className="col-span-2">
                        <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="De 5% para 26% de matrículas" />
                    </Field>
                    <Field label="De (antes)"><Input value={form.valor_antes} onChange={(e) => setForm({ ...form, valor_antes: e.target.value })} placeholder="5%" /></Field>
                    <Field label="Para (depois)"><Input value={form.valor_depois} onChange={(e) => setForm({ ...form, valor_depois: e.target.value })} placeholder="26%" /></Field>
                    <Field label="O que essa métrica é" className="col-span-2">
                        <Input value={form.metrica} onChange={(e) => setForm({ ...form, metrica: e.target.value })} placeholder="dos interessados viraram matrícula" />
                    </Field>
                    <Field label="Prazo"><Input value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} placeholder="no primeiro mês" /></Field>
                    <Field label="Cliente"><Input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} placeholder="Cruzeiro do Sul" /></Field>
                    <Field label="O que a gente fez" className="col-span-2">
                        <Textarea rows={2} value={form.o_que_fizemos} onChange={(e) => setForm({ ...form, o_que_fizemos: e.target.value })} placeholder="Reorganizamos a captação e o atendimento comercial" />
                    </Field>
                    <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form.cliente_publico} onChange={(e) => setForm({ ...form, cliente_publico: e.target.checked })} className="w-4 h-4" />
                        Posso citar o nome do cliente no PDF (senão vai como &quot;cliente do mesmo segmento&quot;)
                    </label>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Check />} Salvar case</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
    return (
        <label className={`flex flex-col gap-1.5 ${className || ""}`}>
            <span className="text-xs font-medium text-slate-600">{label}{hint ? <span className="text-slate-400 font-normal"> · {hint}</span> : ""}</span>
            {children}
        </label>
    );
}
