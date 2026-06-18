"use client";

import { useMemo, useState } from "react";
import { PawPrint, Search, Syringe, Phone, AlertTriangle } from "lucide-react";

interface PetRow {
    id: string;
    name: string;
    species?: string;
    breed?: string;
    birth_date?: string;
    contact?: { id: string; name: string; phone: string } | null;
    vaccines?: { id: string; vaccine_name: string; next_due_at: string | null }[];
}

function soonestDue(vaccines?: PetRow["vaccines"]): string | null {
    const dues = (vaccines ?? []).map((v) => v.next_due_at).filter(Boolean) as string[];
    if (!dues.length) return null;
    return dues.sort()[0];
}

function dueStatus(nextDue: string | null): { label: string; cls: string; overdue: boolean; soon: boolean } | null {
    if (!nextDue) return null;
    const due = new Date(nextDue);
    if (isNaN(due.getTime())) return null;
    const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: "Vacina vencida", cls: "bg-red-100 text-red-700", overdue: true, soon: false };
    if (days <= 30) return { label: `Vence em ${days}d`, cls: "bg-amber-100 text-amber-700", overdue: false, soon: true };
    return { label: "Em dia", cls: "bg-emerald-100 text-emerald-700", overdue: false, soon: false };
}

export default function PetsPageClient({ initialPets }: { initialPets: PetRow[] }) {
    const [search, setSearch] = useState("");
    const [onlyDue, setOnlyDue] = useState(false);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return initialPets.filter((p) => {
            const due = dueStatus(soonestDue(p.vaccines));
            if (onlyDue && !(due?.overdue || due?.soon)) return false;
            if (!q) return true;
            return (
                p.name?.toLowerCase().includes(q) ||
                p.contact?.name?.toLowerCase().includes(q) ||
                p.breed?.toLowerCase().includes(q)
            );
        });
    }, [initialPets, search, onlyDue]);

    const dueCount = initialPets.filter((p) => {
        const d = dueStatus(soonestDue(p.vaccines));
        return d?.overdue || d?.soon;
    }).length;

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex items-center gap-2 mb-1">
                <PawPrint className="text-indigo-600" />
                <h1 className="text-2xl font-bold text-gray-800">Pets</h1>
            </div>
            <p className="text-gray-500 mb-6">Todos os pets cadastrados na clínica e o status da vacinação.</p>

            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative flex-1 min-w-[240px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por pet, tutor ou raça..."
                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                    />
                </div>
                <button
                    onClick={() => setOnlyDue((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        onlyDue ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                >
                    <AlertTriangle size={15} />
                    Vacina vencendo {dueCount > 0 && `(${dueCount})`}
                </button>
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-xl border-dashed border-2 border-gray-200">
                    <PawPrint className="mx-auto text-gray-300 mb-3" size={36} />
                    <p className="text-gray-500">
                        {initialPets.length === 0 ? "Nenhum pet cadastrado ainda. Cadastre pelos painéis dos tutores no Chat." : "Nenhum pet encontrado com esse filtro."}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((pet) => {
                        const due = dueStatus(soonestDue(pet.vaccines));
                        const phone = pet.contact?.phone?.replace(/\D/g, "");
                        return (
                            <div key={pet.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start gap-3">
                                    <div className="w-11 h-11 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                                        <PawPrint size={20} className="text-indigo-500" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-gray-900 truncate">{pet.name}</h3>
                                            {due && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${due.cls}`}>{due.label}</span>}
                                        </div>
                                        <p className="text-xs text-gray-500 truncate">
                                            {[pet.species, pet.breed].filter(Boolean).join(" · ") || "Sem detalhes"}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Tutor</p>
                                        <p className="text-sm font-medium text-gray-700 truncate">{pet.contact?.name || "—"}</p>
                                    </div>
                                    {phone && (
                                        <a
                                            href={`https://wa.me/${phone}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 shrink-0"
                                            title="Abrir no WhatsApp"
                                        >
                                            <Phone size={13} /> WhatsApp
                                        </a>
                                    )}
                                </div>

                                {(pet.vaccines?.length ?? 0) > 0 && (
                                    <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
                                        <Syringe size={12} className="text-indigo-400" />
                                        {pet.vaccines!.length} {pet.vaccines!.length === 1 ? "vacina" : "vacinas"} no histórico
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
