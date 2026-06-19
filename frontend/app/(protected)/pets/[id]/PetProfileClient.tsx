"use client";

import { useState } from "react";
import Link from "next/link";
import {
    PawPrint, ArrowLeft, Phone, Mail, Pencil, Check, X, Syringe, Plus, Trash2,
    Calendar, Stethoscope, Loader2, Cake,
} from "lucide-react";
import { updatePet, addVaccine, deleteVaccine } from "../actions";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

const COMMON_VACCINES = ["V8", "V10", "Antirrábica", "Gripe", "Giárdia"];
const STATUS_LABEL: Record<string, { t: string; c: string }> = {
    agendado: { t: "Agendado", c: "bg-blue-50 text-blue-600" },
    confirmado: { t: "Confirmado", c: "bg-teal-50 text-teal-600" },
    atendido: { t: "Atendido", c: "bg-emerald-50 text-emerald-600" },
    faltou: { t: "Faltou", c: "bg-red-50 text-red-600" },
    cancelado: { t: "Cancelado", c: "bg-gray-100 text-gray-500" },
};

function idade(birth?: string | null): string {
    if (!birth) return "";
    const b = new Date(birth);
    if (isNaN(b.getTime())) return "";
    let months = (Date.now() - b.getTime()) / (1000 * 60 * 60 * 24 * 30.4);
    months = Math.max(0, Math.floor(months));
    const y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return `${m} ${m === 1 ? "mês" : "meses"}`;
    return m === 0 ? `${y} ${y === 1 ? "ano" : "anos"}` : `${y}a ${m}m`;
}
function fmt(d?: string | null) { if (!d) return ""; const x = new Date(d); return isNaN(x.getTime()) ? "" : x.toLocaleDateString("pt-BR"); }
function vacStatus(due?: string | null) {
    if (!due) return null;
    const d = new Date(due); if (isNaN(d.getTime())) return null;
    const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: "Vencida", cls: "bg-red-100 text-red-700" };
    if (days <= 30) return { label: `Vence em ${days}d`, cls: "bg-amber-100 text-amber-700" };
    return { label: "Em dia", cls: "bg-emerald-100 text-emerald-700" };
}

export default function PetProfileClient({ pet: initialPet, appointments }: { pet: any; appointments: any[] }) {
    const confirm = useConfirm();
    const [pet, setPet] = useState<any>(initialPet);
    const [vaccines, setVaccines] = useState<any[]>(initialPet.vaccines ?? []);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        species: pet.species ?? "", breed: pet.breed ?? "", sex: pet.sex ?? "",
        birthDate: pet.birth_date ?? "", weightKg: pet.weight_kg ?? "", neutered: !!pet.neutered,
        color: pet.color ?? "", microchip: pet.microchip ?? "", notes: pet.notes ?? "",
    });

    // Add vaccine
    const [addingVac, setAddingVac] = useState(false);
    const [vac, setVac] = useState({ vaccineName: "V10", appliedAt: "", nextDueAt: "", veterinarian: "" });
    const [savingVac, setSavingVac] = useState(false);

    const tutor = pet.contact;
    const phone = tutor?.phone?.replace(/\D/g, "");

    async function saveInfo() {
        setSaving(true);
        const res = await updatePet(pet.id, {
            species: form.species, breed: form.breed, sex: form.sex,
            birthDate: form.birthDate || null,
            weightKg: form.weightKg === "" ? null : Number(form.weightKg),
            neutered: form.neutered, color: form.color, microchip: form.microchip, notes: form.notes,
        });
        setSaving(false);
        if (res.success) {
            setPet({ ...pet, ...{
                species: form.species, breed: form.breed, sex: form.sex, birth_date: form.birthDate,
                weight_kg: form.weightKg === "" ? null : Number(form.weightKg), neutered: form.neutered,
                color: form.color, microchip: form.microchip, notes: form.notes,
            } });
            setEditing(false);
            toast.success("Prontuário atualizado!");
        } else toast.error(res.error ?? "Erro ao salvar.");
    }

    async function handleAddVac() {
        if (!vac.vaccineName.trim()) { toast.error("Informe a vacina."); return; }
        setSavingVac(true);
        const res = await addVaccine(pet.id, { vaccineName: vac.vaccineName, appliedAt: vac.appliedAt || null, nextDueAt: vac.nextDueAt || null, veterinarian: vac.veterinarian });
        setSavingVac(false);
        if (res.success && res.vaccine) {
            setVaccines((v) => [res.vaccine, ...v]);
            setVac({ vaccineName: "V10", appliedAt: "", nextDueAt: "", veterinarian: "" });
            setAddingVac(false);
            toast.success("Vacina registrada!");
        } else toast.error(res.error ?? "Erro.");
    }

    async function handleDeleteVac(id: string) {
        const ok = await confirm({ title: "Remover vacina?", tone: "danger", confirmText: "Remover" });
        if (!ok) return;
        const prev = vaccines;
        setVaccines((v) => v.filter((x) => x.id !== id));
        const res = await deleteVaccine(id);
        if (!res.success) { setVaccines(prev); toast.error(res.error ?? "Erro."); }
    }

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto">
            <Link href="/pets" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ArrowLeft size={15} /> Voltar para Pets
            </Link>

            {/* Header */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
                <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                        <PawPrint size={28} className="text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-bold text-gray-900">{pet.name}</h1>
                        <p className="text-sm text-gray-500">
                            {[pet.species, pet.breed, pet.sex, idade(pet.birth_date)].filter(Boolean).join(" · ") || "Sem detalhes"}
                        </p>
                        {tutor && (
                            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600">
                                <span className="font-medium">{tutor.name}</span>
                                {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-emerald-600 hover:underline"><Phone size={12} /> WhatsApp</a>}
                                {tutor.email && <span className="flex items-center gap-1"><Mail size={12} /> {tutor.email}</span>}
                            </div>
                        )}
                    </div>
                    {!editing && (
                        <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-indigo-600 flex items-center gap-1 text-sm shrink-0">
                            <Pencil size={14} /> Editar
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Dados clinicos */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">Dados</h2>
                    {!editing ? (
                        <dl className="space-y-2 text-sm">
                            <Row label="Espécie" value={pet.species} />
                            <Row label="Raça" value={pet.breed} />
                            <Row label="Sexo" value={pet.sex} />
                            <Row label="Nascimento" value={pet.birth_date ? `${fmt(pet.birth_date)} (${idade(pet.birth_date)})` : ""} />
                            <Row label="Peso" value={pet.weight_kg ? `${pet.weight_kg} kg` : ""} />
                            <Row label="Castrado" value={pet.neutered ? "Sim" : "Não"} />
                            <Row label="Cor" value={pet.color} />
                            <Row label="Microchip" value={pet.microchip} />
                            <Row label="Observações" value={pet.notes} />
                        </dl>
                    ) : (
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <Field label="Espécie"><input value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} className="inp" /></Field>
                                <Field label="Raça"><input value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className="inp" /></Field>
                                <Field label="Sexo">
                                    <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} className="inp bg-white">
                                        <option value="">—</option><option value="Macho">Macho</option><option value="Fêmea">Fêmea</option>
                                    </select>
                                </Field>
                                <Field label="Nascimento"><input type="date" value={form.birthDate || ""} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className="inp" /></Field>
                                <Field label="Peso (kg)"><input type="number" step="0.1" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} className="inp" /></Field>
                                <Field label="Cor"><input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="inp" /></Field>
                                <Field label="Microchip"><input value={form.microchip} onChange={(e) => setForm({ ...form, microchip: e.target.value })} className="inp" /></Field>
                                <label className="flex items-center gap-2 text-sm text-gray-600 mt-5">
                                    <input type="checkbox" checked={form.neutered} onChange={(e) => setForm({ ...form, neutered: e.target.checked })} /> Castrado
                                </label>
                            </div>
                            <Field label="Observações"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp resize-none" /></Field>
                            <div className="flex gap-2 pt-1">
                                <button onClick={saveInfo} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-1 disabled:opacity-60">
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
                                </button>
                                <button onClick={() => setEditing(false)} className="px-3 bg-gray-100 hover:bg-gray-200 rounded-lg"><X size={14} /></button>
                            </div>
                        </div>
                    )}
                    <style jsx>{`.inp{width:100%;padding:0.4rem 0.6rem;border:1px solid #e5e7eb;border-radius:0.5rem;font-size:0.875rem;outline:none}`}</style>
                </div>

                {/* Carteira de vacinas */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5"><Syringe size={14} className="text-indigo-500" /> Vacinas</h2>
                        {!addingVac && <button onClick={() => setAddingVac(true)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"><Plus size={13} /> Vacina</button>}
                    </div>
                    <div className="space-y-2">
                        {vaccines.length === 0 && !addingVac && <p className="text-xs text-gray-400 italic">Nenhuma vacina registrada.</p>}
                        {vaccines.map((v) => {
                            const st = vacStatus(v.next_due_at);
                            return (
                                <div key={v.id} className="flex items-center gap-2 border border-gray-100 rounded px-2 py-1.5">
                                    <Syringe size={12} className="text-indigo-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5"><span className="text-xs font-semibold text-gray-800">{v.vaccine_name}</span>{st && <span className={`text-[9px] px-1 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>}</div>
                                        <span className="text-[10px] text-gray-500">{v.applied_at && `Aplicada ${fmt(v.applied_at)}`}{v.next_due_at && ` · Próxima ${fmt(v.next_due_at)}`}</span>
                                    </div>
                                    <button onClick={() => handleDeleteVac(v.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                                </div>
                            );
                        })}
                        {addingVac && (
                            <div className="border border-indigo-100 rounded p-2 space-y-2">
                                <div className="flex flex-wrap gap-1">
                                    {COMMON_VACCINES.map((n) => <button key={n} onClick={() => setVac({ ...vac, vaccineName: n })} className={`text-[10px] px-1.5 py-0.5 rounded border ${vac.vaccineName === n ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}>{n}</button>)}
                                </div>
                                <input placeholder="Vacina" value={vac.vaccineName} onChange={(e) => setVac({ ...vac, vaccineName: e.target.value })} className="w-full px-2 py-1 border border-gray-200 rounded text-xs outline-none" />
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="text-[10px] text-gray-500">Aplicada<input type="date" value={vac.appliedAt} onChange={(e) => setVac({ ...vac, appliedAt: e.target.value })} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs outline-none" /></label>
                                    <label className="text-[10px] text-gray-500">Próxima<input type="date" value={vac.nextDueAt} onChange={(e) => setVac({ ...vac, nextDueAt: e.target.value })} className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs outline-none" /></label>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handleAddVac} disabled={savingVac} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1 rounded flex items-center justify-center gap-1 disabled:opacity-60">{savingVac ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar</button>
                                    <button onClick={() => setAddingVac(false)} className="px-2 bg-gray-100 rounded"><X size={12} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Historico de atendimentos */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 mt-4">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5 mb-3"><Calendar size={14} className="text-indigo-500" /> Histórico de atendimentos</h2>
                {appointments.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Nenhum atendimento registrado ainda.</p>
                ) : (
                    <div className="space-y-2">
                        {appointments.map((a) => {
                            const sl = STATUS_LABEL[a.status] ?? STATUS_LABEL.agendado;
                            return (
                                <div key={a.id} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2">
                                    <div className="text-xs text-gray-500 w-20 shrink-0">{fmt(a.starts_at)} {a.starts_at?.slice(11, 16)}</div>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-sm font-medium text-gray-800">{a.service_name || "Atendimento"}</span>
                                        {a.professional?.full_name && <span className="text-[11px] text-gray-500 flex items-center gap-1"><Stethoscope size={11} /> {a.professional.full_name}</span>}
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${sl.c}`}>{sl.t}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value?: string | null }) {
    return (
        <div className="flex justify-between gap-3 border-b border-gray-50 pb-1.5">
            <dt className="text-gray-400">{label}</dt>
            <dd className="text-gray-800 font-medium text-right">{value || "—"}</dd>
        </div>
    );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block text-[11px] font-semibold text-gray-500 col-span-1">{label}{children}</label>;
}
