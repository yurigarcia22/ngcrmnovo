"use client";

import { useState } from "react";
import { KeyRound, Plus, Copy, Check, Trash2, Loader2, X, Webhook } from "lucide-react";
import { createApiKey, revokeApiKey } from "./actions";
import { toast } from "@/lib/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

interface ApiKey {
    id: string;
    name: string;
    key_prefix: string;
    last_used_at: string | null;
    revoked_at: string | null;
    created_at: string;
}

const BASE = typeof window !== "undefined" ? window.location.origin : "https://seu-crm";

export default function ApiSettingsClient({ initialKeys }: { initialKeys: ApiKey[] }) {
    const confirm = useConfirm();
    const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    async function handleCreate() {
        if (!name.trim()) { toast.error("Dê um nome para a chave."); return; }
        setSaving(true);
        const res = await createApiKey(name);
        setSaving(false);
        if (res.success && res.rawKey) {
            setNewKey(res.rawKey);
            setName("");
            setCreating(false);
            // recarrega a lista (a nova chave aparece como prefixo)
            window.location.reload();
        } else {
            toast.error(res.error ?? "Erro ao criar chave.");
        }
    }

    async function handleRevoke(id: string) {
        const ok = await confirm({ title: "Revogar esta chave?", description: "Quem usa essa chave perde o acesso imediatamente.", tone: "danger", confirmText: "Revogar" });
        if (!ok) return;
        setKeys((k) => k.map((x) => (x.id === id ? { ...x, revoked_at: new Date().toISOString() } : x)));
        const res = await revokeApiKey(id);
        if (!res.success) toast.error(res.error ?? "Erro");
    }

    function copyKey() {
        if (!newKey) return;
        navigator.clipboard.writeText(newKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 max-w-xl">
                    Crie chaves para integrar o CRM a ferramentas externas (n8n, automações, ponte com o SimplesVet).
                    A chave aparece <b>uma única vez</b> ao ser criada.
                </p>
                {!creating && (
                    <button onClick={() => setCreating(true)} className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                        <Plus size={16} /> Nova chave
                    </button>
                )}
            </div>

            {/* Form criar */}
            {creating && (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <label htmlFor="apikey-name" className="block text-sm font-semibold text-slate-700 mb-1">Nome da chave</label>
                    <div className="flex gap-2">
                        <input
                            id="apikey-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                            placeholder="Ex: n8n, integração SimplesVet"
                            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5">
                            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Criar
                        </button>
                        <button onClick={() => { setCreating(false); setName(""); }} className="rounded-lg border border-slate-200 px-3 text-slate-600 hover:bg-slate-50"><X size={16} /></button>
                    </div>
                </div>
            )}

            {/* Chave recem-criada (revelada uma vez) */}
            {newKey && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-sm font-semibold text-emerald-800 mb-2">Copie sua chave agora — ela não será mostrada de novo:</p>
                    <button onClick={copyKey} className="w-full flex items-center justify-between gap-3 rounded-lg bg-white border border-emerald-200 px-3 py-2.5 font-mono text-sm text-slate-800">
                        <span className="truncate">{newKey}</span>
                        {copied ? <Check size={16} className="text-emerald-600 shrink-0" /> : <Copy size={16} className="text-slate-400 shrink-0" />}
                    </button>
                </div>
            )}

            {/* Lista de chaves */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {keys.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-slate-500">
                        <KeyRound className="mx-auto mb-2 text-slate-300" size={26} />
                        Nenhuma chave criada ainda.
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {keys.map((k) => (
                            <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-indigo-600">
                                    <KeyRound size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-800 truncate">{k.name}</span>
                                        {k.revoked_at && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">revogada</span>}
                                    </div>
                                    <span className="text-xs text-slate-500 font-mono">{k.key_prefix}…{"  "}
                                        <span className="font-sans">· {k.last_used_at ? `usada ${new Date(k.last_used_at).toLocaleDateString("pt-BR")}` : "nunca usada"}</span>
                                    </span>
                                </div>
                                {!k.revoked_at && (
                                    <button onClick={() => handleRevoke(k.id)} aria-label="Revogar chave" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Mini-doc de uso */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mb-2"><Webhook size={15} className="text-slate-500" /> Como usar</h3>
                <p className="text-[13px] text-slate-600 mb-2">Envie o header <code className="rounded bg-white px-1 py-0.5 text-slate-800 border border-slate-200">Authorization: Bearer SUA_CHAVE</code> nos endpoints:</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-[12px] leading-relaxed text-slate-100">{`# Criar/atualizar um tutor (dedup por telefone)
POST ${BASE}/api/v1/contacts
{ "name": "Maria", "phone": "5531999999999", "email": "maria@x.com" }

# Cadastrar um pet (liga ao tutor por telefone)
POST ${BASE}/api/v1/pets
{ "name": "Thor", "tutorPhone": "5531999999999", "species": "Cão", "breed": "SRD" }

# Agendar um atendimento
POST ${BASE}/api/v1/appointments
{ "startsAt": "2026-06-25T14:00:00", "petId": "...", "serviceName": "Consulta" }

# Listar contatos / pets
GET ${BASE}/api/v1/contacts?search=maria
GET ${BASE}/api/v1/pets`}</pre>
                <p className="text-[12px] text-slate-500 mt-2">Webhooks de saída (reagir a evento, ex: mensagem recebida) chegam na próxima fase.</p>
            </div>
        </div>
    );
}
