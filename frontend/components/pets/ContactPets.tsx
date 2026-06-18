"use client";

import { useEffect, useState } from "react";
import {
    PawPrint, Plus, Trash2, Check, X, Syringe, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import {
    getContactPets, createPet, deletePet, addVaccine, deleteVaccine,
} from "@/app/(protected)/pets/actions";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

const SPECIES = ["Cão", "Gato", "Outro"];
const COMMON_VACCINES = ["V8", "V10", "Antirrábica", "Gripe", "Giárdia"];

// Idade a partir da data de nascimento.
function idade(birth?: string | null): string {
    if (!birth) return "";
    const b = new Date(birth);
    if (isNaN(b.getTime())) return "";
    const now = new Date();
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (months < 0) months = 0;
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0) return `${m} ${m === 1 ? "mês" : "meses"}`;
    return m === 0 ? `${y} ${y === 1 ? "ano" : "anos"}` : `${y}a ${m}m`;
}

// Status de uma vacina pelo vencimento.
function vaccineStatus(nextDue?: string | null): { label: string; cls: string } | null {
    if (!nextDue) return null;
    const due = new Date(nextDue);
    if (isNaN(due.getTime())) return null;
    const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: "Vencida", cls: "bg-red-100 text-red-700" };
    if (days <= 30) return { label: `Vence em ${days}d`, cls: "bg-amber-100 text-amber-700" };
    return { label: `Em dia`, cls: "bg-emerald-100 text-emerald-700" };
}

function fmtDate(d?: string | null): string {
    if (!d) return "";
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("pt-BR");
}

export default function ContactPets({ contactId }: { contactId: string }) {
    const confirm = useConfirm();
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [pets, setPets] = useState<any[]>([]);

    // Form de novo pet
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ name: "", species: "Cão", breed: "", sex: "", birthDate: "" });

    // Expandir carteira por pet
    const [openPet, setOpenPet] = useState<string | null>(null);

    useEffect(() => {
        if (!contactId) return;
        let active = true;
        setLoading(true);
        getContactPets(contactId).then((res) => {
            if (!active) return;
            setEnabled(!!res.enabled);
            setPets(res.pets ?? []);
            setLoading(false);
        });
        return () => { active = false; };
    }, [contactId]);

    if (!loading && !enabled) return null; // modulo desligado: some

    async function handleAddPet() {
        if (!form.name.trim()) { toast.error("Informe o nome do pet."); return; }
        setSaving(true);
        const res = await createPet({
            contactId,
            name: form.name.trim(),
            species: form.species,
            breed: form.breed,
            sex: form.sex,
            birthDate: form.birthDate || null,
        });
        setSaving(false);
        if (res.success && res.pet) {
            setPets((p) => [...p, res.pet]);
            setForm({ name: "", species: "Cão", breed: "", sex: "", birthDate: "" });
            setAdding(false);
            toast.success("Pet cadastrado!");
        } else {
            toast.error(res.error ?? "Erro ao cadastrar pet.");
        }
    }

    async function handleDeletePet(petId: string) {
        const ok = await confirm({
            title: "Remover pet?",
            description: "O histórico de vacinas deste pet também será apagado.",
            tone: "danger",
            confirmText: "Remover",
        });
        if (!ok) return;
        const prev = pets;
        setPets((p) => p.filter((x) => x.id !== petId));
        const res = await deletePet(petId);
        if (!res.success) { setPets(prev); toast.error(res.error ?? "Erro ao remover."); }
    }

    return (
        <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <PawPrint size={13} className="text-indigo-500" />
                    Pets {pets.length > 0 && `(${pets.length})`}
                </span>
                {!adding && (
                    <button
                        onClick={() => setAdding(true)}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                    >
                        <Plus size={13} /> Adicionar
                    </button>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-3"><Loader2 className="animate-spin text-gray-300" size={18} /></div>
            ) : (
                <div className="space-y-2">
                    {pets.length === 0 && !adding && (
                        <p className="text-xs text-gray-400 italic">Nenhum pet cadastrado para este tutor.</p>
                    )}

                    {pets.map((pet) => (
                        <PetCard
                            key={pet.id}
                            pet={pet}
                            open={openPet === pet.id}
                            onToggle={() => setOpenPet(openPet === pet.id ? null : pet.id)}
                            onDelete={() => handleDeletePet(pet.id)}
                            onVaccinesChange={(vaccines) =>
                                setPets((p) => p.map((x) => (x.id === pet.id ? { ...x, vaccines } : x)))
                            }
                        />
                    ))}

                    {/* Form novo pet */}
                    {adding && (
                        <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 space-y-2">
                            <input
                                autoFocus
                                placeholder="Nome do pet"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={form.species}
                                    onChange={(e) => setForm({ ...form, species: e.target.value })}
                                    className="px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none"
                                >
                                    {SPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                                <input
                                    placeholder="Raça"
                                    value={form.breed}
                                    onChange={(e) => setForm({ ...form, breed: e.target.value })}
                                    className="px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none"
                                />
                                <select
                                    value={form.sex}
                                    onChange={(e) => setForm({ ...form, sex: e.target.value })}
                                    className="px-2 py-1.5 border border-gray-200 rounded text-sm bg-white focus:outline-none"
                                >
                                    <option value="">Sexo</option>
                                    <option value="Macho">Macho</option>
                                    <option value="Fêmea">Fêmea</option>
                                </select>
                                <input
                                    type="date"
                                    title="Nascimento"
                                    value={form.birthDate}
                                    onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                                    className="px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleAddPet}
                                    disabled={saving}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-1.5 rounded flex items-center justify-center gap-1 disabled:opacity-60"
                                >
                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
                                </button>
                                <button
                                    onClick={() => { setAdding(false); setForm({ name: "", species: "Cão", breed: "", sex: "", birthDate: "" }); }}
                                    className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function PetCard({ pet, open, onToggle, onDelete, onVaccinesChange }: {
    pet: any; open: boolean; onToggle: () => void; onDelete: () => void;
    onVaccinesChange: (v: any[]) => void;
}) {
    const confirm = useConfirm();
    const vaccines: any[] = pet.vaccines ?? [];
    const nextDue = vaccines.find((v) => v.next_due_at)?.next_due_at;
    const status = vaccineStatus(nextDue);

    const [addingVac, setAddingVac] = useState(false);
    const [vac, setVac] = useState({ vaccineName: "V10", appliedAt: "", nextDueAt: "", veterinarian: "" });
    const [savingVac, setSavingVac] = useState(false);

    async function handleAddVac() {
        if (!vac.vaccineName.trim()) { toast.error("Informe a vacina."); return; }
        setSavingVac(true);
        const res = await addVaccine(pet.id, {
            vaccineName: vac.vaccineName,
            appliedAt: vac.appliedAt || null,
            nextDueAt: vac.nextDueAt || null,
            veterinarian: vac.veterinarian,
        });
        setSavingVac(false);
        if (res.success && res.vaccine) {
            onVaccinesChange([res.vaccine, ...vaccines]);
            setVac({ vaccineName: "V10", appliedAt: "", nextDueAt: "", veterinarian: "" });
            setAddingVac(false);
            toast.success("Vacina registrada!");
        } else {
            toast.error(res.error ?? "Erro ao registrar vacina.");
        }
    }

    async function handleDeleteVac(id: string) {
        const ok = await confirm({ title: "Remover vacina?", tone: "danger", confirmText: "Remover" });
        if (!ok) return;
        const prev = vaccines;
        onVaccinesChange(vaccines.filter((v) => v.id !== id));
        const res = await deleteVaccine(id);
        if (!res.success) { onVaccinesChange(prev); toast.error(res.error ?? "Erro."); }
    }

    return (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 p-2.5">
                <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 shrink-0">
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                    <PawPrint size={15} className="text-indigo-500" />
                </div>
                <button onClick={onToggle} className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-900 truncate">{pet.name}</span>
                        {status && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${status.cls}`}>{status.label}</span>}
                    </div>
                    <span className="text-[11px] text-gray-500">
                        {[pet.species, pet.breed, idade(pet.birth_date)].filter(Boolean).join(" · ") || "Sem detalhes"}
                    </span>
                </button>
                <button onClick={onDelete} className="text-gray-300 hover:text-red-500 p-1 shrink-0" title="Remover pet">
                    <Trash2 size={13} />
                </button>
            </div>

            {open && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                            <Syringe size={11} /> Carteira de vacinas
                        </span>
                        {!addingVac && (
                            <button onClick={() => setAddingVac(true)} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5">
                                <Plus size={12} /> Vacina
                            </button>
                        )}
                    </div>

                    {vaccines.length === 0 && !addingVac && (
                        <p className="text-[11px] text-gray-400 italic">Nenhuma vacina registrada.</p>
                    )}

                    {vaccines.map((v) => {
                        const st = vaccineStatus(v.next_due_at);
                        return (
                            <div key={v.id} className="flex items-center gap-2 bg-white border border-gray-100 rounded px-2 py-1.5">
                                <Syringe size={12} className="text-indigo-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-gray-800">{v.vaccine_name}</span>
                                        {st && <span className={`text-[9px] px-1 py-0.5 rounded-full font-semibold ${st.cls}`}>{st.label}</span>}
                                    </div>
                                    <span className="text-[10px] text-gray-500">
                                        {v.applied_at && `Aplicada ${fmtDate(v.applied_at)}`}
                                        {v.next_due_at && ` · Próxima ${fmtDate(v.next_due_at)}`}
                                    </span>
                                </div>
                                <button onClick={() => handleDeleteVac(v.id)} className="text-gray-300 hover:text-red-500 shrink-0">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        );
                    })}

                    {addingVac && (
                        <div className="bg-white border border-indigo-100 rounded p-2 space-y-2">
                            <div className="flex flex-wrap gap-1">
                                {COMMON_VACCINES.map((name) => (
                                    <button
                                        key={name}
                                        onClick={() => setVac({ ...vac, vaccineName: name })}
                                        className={`text-[10px] px-1.5 py-0.5 rounded border ${vac.vaccineName === name ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                            <input
                                placeholder="Vacina"
                                value={vac.vaccineName}
                                onChange={(e) => setVac({ ...vac, vaccineName: e.target.value })}
                                className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-gray-500">
                                    Aplicada
                                    <input type="date" value={vac.appliedAt} onChange={(e) => setVac({ ...vac, appliedAt: e.target.value })}
                                        className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs focus:outline-none" />
                                </label>
                                <label className="text-[10px] text-gray-500">
                                    Próxima dose
                                    <input type="date" value={vac.nextDueAt} onChange={(e) => setVac({ ...vac, nextDueAt: e.target.value })}
                                        className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs focus:outline-none" />
                                </label>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleAddVac} disabled={savingVac}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1 rounded flex items-center justify-center gap-1 disabled:opacity-60">
                                    {savingVac ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar
                                </button>
                                <button onClick={() => setAddingVac(false)} className="px-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded"><X size={12} /></button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
