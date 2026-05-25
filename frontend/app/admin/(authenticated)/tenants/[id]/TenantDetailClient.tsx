"use client";

import { useState, useTransition } from "react";
import {
    CheckCircle2,
    XCircle,
    Power,
    PowerOff,
    AlertTriangle,
    Save,
    Users as UsersIcon,
    Mail,
} from "lucide-react";
import {
    MODULE_REGISTRY,
    MODULE_KEYS,
    type ModuleKey,
    type TenantModulesMap,
} from "@/lib/modules";
import {
    toggleModuleAction,
    toggleTenantActiveAction,
    updateTenantMetaAction,
} from "./actions";

interface Tenant {
    id: string;
    name: string;
    slug: string;
    plan: string;
    is_active: boolean;
    billing_email: string | null;
    notes: string | null;
    created_at: string;
}

interface Profile {
    id: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
}

interface Props {
    tenantId: string;
    tenant: Tenant;
    modules: TenantModulesMap;
    profiles: Profile[];
}

export function TenantDetailClient({ tenantId, tenant, modules, profiles }: Props) {
    const [localModules, setLocalModules] = useState<TenantModulesMap>(modules);
    const [localActive, setLocalActive] = useState<boolean>(tenant.is_active);
    const [pendingKey, setPendingKey] = useState<ModuleKey | null>(null);
    const [isTogglingActive, startToggleActive] = useTransition();
    const [isSavingMeta, startSavingMeta] = useTransition();
    const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

    async function handleToggleModule(key: ModuleKey) {
        const next = !localModules[key];
        setLocalModules((m) => ({ ...m, [key]: next }));
        setPendingKey(key);
        const res = await toggleModuleAction(tenantId, key, next);
        setPendingKey(null);
        if (!res.ok) {
            // rollback
            setLocalModules((m) => ({ ...m, [key]: !next }));
            setFeedback({ kind: "err", msg: res.error });
            return;
        }
        setFeedback({
            kind: "ok",
            msg: `Modulo "${MODULE_REGISTRY[key].label}" ${next ? "ativado" : "desativado"}.`,
        });
    }

    function handleToggleActive() {
        const target = !localActive;
        startToggleActive(async () => {
            const res = await toggleTenantActiveAction(tenantId, target);
            if (!res.ok) {
                setFeedback({ kind: "err", msg: res.error });
                return;
            }
            setLocalActive(target);
            setFeedback({
                kind: "ok",
                msg: target ? "Tenant reativado." : "Tenant desativado.",
            });
        });
    }

    function handleSaveMeta(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startSavingMeta(async () => {
            const res = await updateTenantMetaAction(tenantId, fd);
            setFeedback(
                res.ok
                    ? { kind: "ok", msg: "Dados salvos." }
                    : { kind: "err", msg: res.error }
            );
        });
    }

    return (
        <div className="space-y-6">
            {/* Feedback */}
            {feedback && (
                <div
                    className={`flex items-start gap-2 px-4 py-3 rounded-lg text-sm ${
                        feedback.kind === "ok"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                >
                    {feedback.kind === "ok" ? (
                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <span className="flex-1">{feedback.msg}</span>
                    <button
                        onClick={() => setFeedback(null)}
                        className="text-xs opacity-60 hover:opacity-100"
                    >
                        fechar
                    </button>
                </div>
            )}

            {/* Status + ativar/desativar */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Status
                        </div>
                        {localActive ? (
                            <div className="flex items-center gap-2 text-emerald-700">
                                <CheckCircle2 className="w-5 h-5" />
                                <span className="font-semibold">Ativo</span>
                                <span className="text-xs text-slate-500">
                                    — usuarios desta empresa podem logar normalmente.
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-rose-700">
                                <XCircle className="w-5 h-5" />
                                <span className="font-semibold">Inativo</span>
                                <span className="text-xs text-slate-500">
                                    — login bloqueado por enquanto.
                                </span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleToggleActive}
                        disabled={isTogglingActive}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                            localActive
                                ? "text-rose-700 bg-rose-50 hover:bg-rose-100"
                                : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                        }`}
                    >
                        {localActive ? (
                            <>
                                <PowerOff className="w-4 h-4" />
                                Desativar tenant
                            </>
                        ) : (
                            <>
                                <Power className="w-4 h-4" />
                                Reativar tenant
                            </>
                        )}
                    </button>
                </div>
            </section>

            {/* Modulos */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="mb-4">
                    <h2 className="text-base font-bold text-slate-900">Modulos liberados</h2>
                    <p className="text-xs text-slate-500 mt-1">
                        Clique para ligar/desligar cada modulo. A mudanca e aplicada
                        instantaneamente para o tenant.
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {MODULE_KEYS.map((key) => {
                        const meta = MODULE_REGISTRY[key];
                        const enabled = localModules[key];
                        const isPending = pendingKey === key;
                        return (
                            <button
                                key={key}
                                onClick={() => handleToggleModule(key)}
                                disabled={isPending}
                                className={`flex items-start gap-3 p-4 text-left rounded-lg border-2 transition-all ${
                                    enabled
                                        ? "border-indigo-500 bg-indigo-50/40"
                                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                                } ${isPending ? "opacity-60" : ""}`}
                            >
                                <div
                                    className={`w-10 h-6 rounded-full relative shrink-0 mt-0.5 transition-colors ${
                                        enabled ? "bg-indigo-600" : "bg-slate-300"
                                    }`}
                                >
                                    <span
                                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${
                                            enabled ? "left-[18px]" : "left-0.5"
                                        }`}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-slate-900">
                                        {meta.label}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        {meta.description}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Metadata */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Dados da empresa</h2>
                <form onSubmit={handleSaveMeta} className="space-y-4">
                    <Field label="Nome" name="name" defaultValue={tenant.name} required />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SelectField
                            label="Plano"
                            name="plan"
                            defaultValue={tenant.plan}
                            options={[
                                { value: "custom", label: "Custom" },
                                { value: "starter", label: "Starter" },
                                { value: "pro", label: "Pro" },
                                { value: "enterprise", label: "Enterprise" },
                            ]}
                        />
                        <Field
                            label="Email financeiro"
                            name="billing_email"
                            type="email"
                            defaultValue={tenant.billing_email ?? ""}
                        />
                    </div>
                    <TextareaField
                        label="Notas internas"
                        name="notes"
                        defaultValue={tenant.notes ?? ""}
                        placeholder="Apenas voce ve."
                    />
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={isSavingMeta}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            {isSavingMeta ? "Salvando..." : "Salvar"}
                        </button>
                    </div>
                </form>
            </section>

            {/* Usuarios */}
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                    <UsersIcon className="w-4 h-4 text-slate-500" />
                    <h2 className="text-base font-bold text-slate-900">
                        Usuarios ({profiles.length})
                    </h2>
                </div>
                {profiles.length === 0 ? (
                    <div className="text-sm text-slate-500 py-4">
                        Nenhum usuario cadastrado neste tenant ainda.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {profiles.map((p) => (
                            <div
                                key={p.id}
                                className="flex items-center justify-between py-3"
                            >
                                <div>
                                    <div className="text-sm font-semibold text-slate-900">
                                        {p.full_name ?? "(sem nome)"}
                                    </div>
                                    <div className="text-xs text-slate-500 capitalize">
                                        {p.role}
                                    </div>
                                </div>
                                {p.is_active ? (
                                    <span className="text-[11px] font-semibold text-emerald-700">
                                        ativo
                                    </span>
                                ) : (
                                    <span className="text-[11px] font-semibold text-slate-400">
                                        inativo
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function Field({
    label,
    name,
    type = "text",
    defaultValue,
    required,
}: {
    label: string;
    name: string;
    type?: string;
    defaultValue?: string;
    required?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {label}
            </label>
            <input
                name={name}
                type={type}
                defaultValue={defaultValue}
                required={required}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
        </div>
    );
}

function SelectField({
    label,
    name,
    defaultValue,
    options,
}: {
    label: string;
    name: string;
    defaultValue: string;
    options: { value: string; label: string }[];
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {label}
            </label>
            <select
                name={name}
                defaultValue={defaultValue}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

function TextareaField({
    label,
    name,
    defaultValue,
    placeholder,
}: {
    label: string;
    name: string;
    defaultValue: string;
    placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {label}
            </label>
            <textarea
                name={name}
                defaultValue={defaultValue}
                placeholder={placeholder}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 resize-none"
            />
        </div>
    );
}
