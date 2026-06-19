"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
    Calendar, ChevronLeft, ChevronRight, Plus, Clock, PawPrint, User, Stethoscope,
    Trash2, X, Loader2, Search, Check,
} from "lucide-react";
import {
    getAppointmentsByDay, createAppointment, updateAppointmentStatus, deleteAppointment,
    getServices, getProfessionals, searchTutorsWithPets,
} from "./actions";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import VetSummary from "./VetSummary";

const STATUSES: { key: string; label: string; cls: string; dot: string }[] = [
    { key: "agendado", label: "Agendado", cls: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
    { key: "confirmado", label: "Confirmado", cls: "bg-teal-50 text-teal-700 border-teal-200", dot: "bg-teal-500" },
    { key: "atendido", label: "Atendido", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    { key: "faltou", label: "Faltou", cls: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
    { key: "cancelado", label: "Cancelado", cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
];
const statusMeta = (k: string) => STATUSES.find((s) => s.key === k) ?? STATUSES[0];

// Extrai HH:MM e dd/mm direto da string ISO (sem conversao de fuso).
const timeOf = (iso: string) => (iso ? iso.slice(11, 16) : "");
function todayStr() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function addDays(dateStr: string, n: number) {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
}
function prettyDate(dateStr: string) {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}
function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
}

export default function AgendaClient() {
    const confirm = useConfirm();
    const [date, setDate] = useState<string>(todayStr());
    const [loading, setLoading] = useState(true);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [professionals, setProfessionals] = useState<any[]>([]);
    const [showNew, setShowNew] = useState(false);

    const load = useCallback(async (d: string) => {
        setLoading(true);
        const res = await getAppointmentsByDay(d);
        setAppointments(res.appointments ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { load(date); }, [date, load]);
    useEffect(() => {
        getServices().then((r) => setServices(r.services ?? []));
        getProfessionals().then((r) => setProfessionals(r.professionals ?? []));
    }, []);

    const counts = STATUSES.map((s) => ({ ...s, n: appointments.filter((a) => a.status === s.key).length }));

    async function changeStatus(id: string, status: string) {
        setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
        const res = await updateAppointmentStatus(id, status);
        if (!res.success) { toast.error(res.error ?? "Erro"); load(date); }
    }

    async function handleDelete(id: string) {
        const ok = await confirm({ title: "Remover atendimento?", tone: "danger", confirmText: "Remover" });
        if (!ok) return;
        const prev = appointments;
        setAppointments((p) => p.filter((a) => a.id !== id));
        const res = await deleteAppointment(id);
        if (!res.success) { setAppointments(prev); toast.error(res.error ?? "Erro"); }
    }

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto">
            {/* Header */}
            <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
                <div>
                    <p className="text-[13px] font-medium text-indigo-600 flex items-center gap-1.5">
                        <Stethoscope size={15} /> Clínica
                    </p>
                    <h1 className="mt-1 text-2xl font-bold text-slate-800">{greeting()}!</h1>
                    <p className="text-sm text-slate-500">Sua agenda de atendimentos.</p>
                </div>
                <button
                    onClick={() => setShowNew(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 active:scale-[0.98]"
                >
                    <Plus size={18} /> Novo atendimento
                </button>
            </header>

            {/* Resumo da clinica */}
            <VetSummary />

            {/* Navegacao de data */}
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2 mb-4">
                <button aria-label="Dia anterior" onClick={() => setDate(addDays(date, -1))} className="flex h-9 w-9 items-center justify-center hover:bg-slate-100 rounded-lg text-slate-600"><ChevronLeft size={18} /></button>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-800 capitalize">{prettyDate(date)}</span>
                    {date !== todayStr() && (
                        <button onClick={() => setDate(todayStr())} className="text-xs text-indigo-600 font-semibold hover:underline">Hoje</button>
                    )}
                    <input
                        type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())}
                        aria-label="Escolher data da agenda"
                        className="text-xs border border-slate-200 rounded px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                </div>
                <button aria-label="Próximo dia" onClick={() => setDate(addDays(date, 1))} className="flex h-9 w-9 items-center justify-center hover:bg-slate-100 rounded-lg text-slate-600"><ChevronRight size={18} /></button>
            </div>

            {/* Resumo por status do dia (faixa, nao card-grid) */}
            <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-sm">
                {counts.map((c) => (
                    <span key={c.key} className="flex items-center gap-1.5 text-slate-600">
                        <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                        <span className="font-semibold tabular-nums text-slate-800">{c.n}</span>
                        <span className="text-slate-500">{c.label}</span>
                    </span>
                ))}
            </div>

            {/* Lista de atendimentos */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-300" size={28} /></div>
            ) : appointments.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-xl border-dashed border-2 border-slate-200">
                    <Calendar className="mx-auto text-slate-300 mb-3" size={34} />
                    <p className="text-slate-500">Nenhum atendimento neste dia.</p>
                    <button onClick={() => setShowNew(true)} className="mt-3 text-indigo-600 font-semibold hover:underline">Agendar agora</button>
                </div>
            ) : (
                <div className="space-y-2">
                    {appointments.map((a) => {
                        const sm = statusMeta(a.status);
                        return (
                            <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 hover:shadow-sm transition-shadow">
                                <div className="flex flex-col items-center justify-center w-14 shrink-0">
                                    <Clock size={13} className="text-slate-400" />
                                    <span className="text-sm font-bold text-slate-800 tabular-nums">{timeOf(a.starts_at)}</span>
                                </div>
                                <div className="w-px self-stretch bg-slate-100" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <PawPrint size={14} className="text-indigo-500 shrink-0" />
                                        <span className="text-sm font-semibold text-slate-800 truncate">{a.pet?.name ?? "Sem pet"}</span>
                                        {a.service_name && <span className="text-[11px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded">{a.service_name}</span>}
                                    </div>
                                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                                        <span className="flex items-center gap-1 truncate"><User size={11} /> {a.contact?.name ?? "—"}</span>
                                        {a.professional?.full_name && <span className="flex items-center gap-1 truncate"><Stethoscope size={11} /> {a.professional.full_name}</span>}
                                    </div>
                                </div>
                                <select
                                    value={a.status}
                                    onChange={(e) => changeStatus(a.id, e.target.value)}
                                    aria-label={`Status do atendimento de ${a.pet?.name ?? "pet"}`}
                                    className={`text-[11px] font-semibold border rounded-full px-2.5 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-200 ${sm.cls}`}
                                >
                                    {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                                </select>
                                <button aria-label={`Remover atendimento de ${a.pet?.name ?? "pet"}`} onClick={() => handleDelete(a.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 shrink-0"><Trash2 size={15} /></button>
                            </div>
                        );
                    })}
                </div>
            )}

            {showNew && (
                <NewAppointmentModal
                    date={date}
                    services={services}
                    professionals={professionals}
                    onClose={() => setShowNew(false)}
                    onCreated={(appt) => {
                        setShowNew(false);
                        if (appt.starts_at?.slice(0, 10) === date) setAppointments((p) => [...p, appt].sort((x, y) => x.starts_at.localeCompare(y.starts_at)));
                        toast.success("Atendimento agendado!");
                    }}
                />
            )}
        </div>
    );
}

function NewAppointmentModal({ date, services, professionals, onClose, onCreated }: {
    date: string; services: any[]; professionals: any[]; onClose: () => void; onCreated: (a: any) => void;
}) {
    const [search, setSearch] = useState("");
    const [tutors, setTutors] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [tutor, setTutor] = useState<any>(null);
    const [petId, setPetId] = useState<string>("");
    const [serviceId, setServiceId] = useState<string>("");
    const [time, setTime] = useState("09:00");
    const [day, setDay] = useState(date);
    const [professionalId, setProfessionalId] = useState("");
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const closeBtnRef = useRef<HTMLButtonElement>(null);

    // Esc fecha o modal; foco inicial no botao de fechar.
    useEffect(() => {
        closeBtnRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    useEffect(() => {
        const t = setTimeout(async () => {
            if (!search.trim()) { setTutors([]); return; }
            setSearching(true);
            const res = await searchTutorsWithPets(search);
            setTutors(res.tutors ?? []);
            setSearching(false);
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    async function save() {
        if (!tutor) { toast.error("Selecione o tutor."); return; }
        const svcSel = services.find((s) => String(s.id) === serviceId);
        setSaving(true);
        const res = await createAppointment({
            contactId: tutor.id,
            petId: petId || (tutor.pets?.[0]?.id ?? null),
            serviceId: svcSel ? svcSel.id : null,
            serviceName: svcSel?.name ?? null,
            professionalId: professionalId || null,
            startsAt: `${day}T${time}:00`,
            durationMin: svcSel?.duration_min ?? 30,
            price: svcSel?.price ?? 0,
            notes,
        });
        setSaving(false);
        if (res.success && res.appointment) onCreated(res.appointment);
        else toast.error(res.error ?? "Erro ao agendar.");
    }

    return (
        <div
            className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="novo-atendimento-titulo"
                className="bg-white rounded-xl w-full max-w-md p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 id="novo-atendimento-titulo" className="text-lg font-bold text-slate-800">Novo atendimento</h2>
                    <button ref={closeBtnRef} aria-label="Fechar" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={20} /></button>
                </div>

                {/* Tutor */}
                {!tutor ? (
                    <div className="mb-3">
                        <label htmlFor="busca-tutor" className="block text-xs font-semibold text-slate-600 mb-1">Tutor</label>
                        <div className="relative">
                            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                id="busca-tutor"
                                autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar tutor pelo nome..."
                                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                        </div>
                        {searching && <p className="text-xs text-slate-500 mt-1">Buscando...</p>}
                        {tutors.length > 0 && (
                            <div className="mt-1 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
                                {tutors.map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => { setTutor(t); setPetId(t.pets?.[0]?.id ?? ""); }}
                                        className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-sm"
                                    >
                                        <span className="font-medium text-slate-800">{t.name}</span>
                                        <span className="text-xs text-slate-500 ml-2">{(t.pets ?? []).length} pet(s)</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="mb-3 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                        <span className="text-sm font-medium text-indigo-800">{tutor.name}</span>
                        <button onClick={() => { setTutor(null); setPetId(""); }} className="text-xs font-semibold text-indigo-700 hover:underline">trocar</button>
                    </div>
                )}

                {tutor && (
                    <>
                        {/* Pet */}
                        <div className="mb-3">
                            <label htmlFor="campo-pet" className="block text-xs font-semibold text-slate-600 mb-1">Pet</label>
                            <select id="campo-pet" value={petId} onChange={(e) => setPetId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                {(tutor.pets ?? []).length === 0 && <option value="">Sem pet cadastrado</option>}
                                {(tutor.pets ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.species ? ` (${p.species})` : ""}</option>)}
                            </select>
                            {(tutor.pets ?? []).length === 0 && (
                                <p className="text-[11px] text-amber-700 mt-1">Esse tutor ainda nao tem pet. Cadastre pelo Chat ou agende sem pet.</p>
                            )}
                        </div>

                        {/* Servico */}
                        <div className="mb-3">
                            <label htmlFor="campo-servico" className="block text-xs font-semibold text-slate-600 mb-1">Serviço</label>
                            <select id="campo-servico" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                <option value="">Selecione...</option>
                                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>

                        {/* Data + hora */}
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                                <label htmlFor="campo-data" className="block text-xs font-semibold text-slate-600 mb-1">Data</label>
                                <input id="campo-data" type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            </div>
                            <div>
                                <label htmlFor="campo-hora" className="block text-xs font-semibold text-slate-600 mb-1">Hora</label>
                                <input id="campo-hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            </div>
                        </div>

                        {/* Profissional */}
                        <div className="mb-3">
                            <label htmlFor="campo-profissional" className="block text-xs font-semibold text-slate-600 mb-1">Profissional</label>
                            <select id="campo-profissional" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                <option value="">Qualquer / não definido</option>
                                {professionals.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                            </select>
                        </div>

                        {/* Observacoes */}
                        <div className="mb-4">
                            <label htmlFor="campo-obs" className="block text-xs font-semibold text-slate-600 mb-1">Observações</label>
                            <textarea id="campo-obs" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex: primeira consulta, animal agitado..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
                        </div>

                        <button onClick={save} disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60">
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Agendar
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
