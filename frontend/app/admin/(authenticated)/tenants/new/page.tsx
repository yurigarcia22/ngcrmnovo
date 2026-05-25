"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { MODULE_REGISTRY, MODULE_KEYS } from "@/lib/modules";
import { createTenantAction } from "./actions";

export default function NewTenantPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{ url?: string } | null>(null);
    const [isPending, startTransition] = useTransition();

    function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
            const res = await createTenantAction(fd);
            if (!res.ok) {
                setError(res.error);
                return;
            }
            setSuccess({ url: res.inviteUrl });
            setTimeout(() => router.push(`/admin/tenants/${res.tenantId}`), 1500);
        });
    }

    return (
        <div className="p-8 max-w-3xl mx-auto">
            <Link
                href="/admin/tenants"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 mb-4 transition-colors"
            >
                <ArrowLeft className="w-3 h-3" />
                Tenants
            </Link>

            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900">Novo tenant</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Cadastre uma empresa nova, escolha os modulos liberados e
                    convide o primeiro admin.
                </p>
            </div>

            {error && (
                <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    {error}
                </div>
            )}

            {success && (
                <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <div className="font-semibold">Tenant criado!</div>
                        <div className="text-xs mt-1">
                            Convite enviado para o admin. Redirecionando para o
                            detalhe do tenant...
                        </div>
                    </div>
                </div>
            )}

            <form onSubmit={onSubmit} className="space-y-6">
                {/* Empresa */}
                <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <h2 className="text-base font-bold text-slate-900">Empresa</h2>
                    <Field label="Nome da empresa" name="name" required />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <SelectField
                            label="Plano"
                            name="plan"
                            defaultValue="custom"
                            options={[
                                { value: "custom", label: "Custom" },
                                { value: "starter", label: "Starter" },
                                { value: "pro", label: "Pro" },
                                { value: "enterprise", label: "Enterprise" },
                            ]}
                        />
                        <Field
                            label="Email financeiro (opcional)"
                            name="billing_email"
                            type="email"
                        />
                    </div>
                    <TextareaField
                        label="Notas internas (opcional)"
                        name="notes"
                        placeholder="So voce ve."
                    />
                </section>

                {/* Modulos */}
                <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h2 className="text-base font-bold text-slate-900 mb-1">
                        Modulos liberados
                    </h2>
                    <p className="text-xs text-slate-500 mb-4">
                        Marque o que essa empresa pode usar. Pode mudar depois.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {MODULE_KEYS.map((key) => {
                            const meta = MODULE_REGISTRY[key];
                            return (
                                <label
                                    key={key}
                                    className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer transition-all"
                                >
                                    <input
                                        type="checkbox"
                                        name={`mod_${key}`}
                                        defaultChecked={meta.defaultEnabled}
                                        className="mt-0.5 w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                    />
                                    <div className="flex-1">
                                        <div className="text-sm font-semibold text-slate-900">
                                            {meta.label}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                            {meta.description}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                </section>

                {/* Admin */}
                <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                    <div>
                        <h2 className="text-base font-bold text-slate-900">
                            Primeiro admin do tenant
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                            Sera convidado por email para criar a senha. Tera role
                            "admin" dentro do CRM da empresa.
                        </p>
                    </div>
                    <Field
                        label="Email do admin"
                        name="admin_email"
                        type="email"
                        required
                    />
                    <Field label="Nome completo (opcional)" name="admin_name" />
                </section>

                <div className="flex items-center justify-between">
                    <Link
                        href="/admin/tenants"
                        className="text-sm font-semibold text-slate-500 hover:text-slate-700"
                    >
                        Cancelar
                    </Link>
                    <button
                        type="submit"
                        disabled={isPending || !!success}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-lg shadow-sm transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        {isPending
                            ? "Criando..."
                            : success
                              ? "Criado!"
                              : "Criar tenant"}
                    </button>
                </div>
            </form>
        </div>
    );
}

function Field({
    label,
    name,
    type = "text",
    required,
}: {
    label: string;
    name: string;
    type?: string;
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
    placeholder,
}: {
    label: string;
    name: string;
    placeholder?: string;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                {label}
            </label>
            <textarea
                name={name}
                placeholder={placeholder}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 resize-none"
            />
        </div>
    );
}
