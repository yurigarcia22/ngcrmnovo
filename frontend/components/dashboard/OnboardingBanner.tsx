"use client";

import Link from "next/link";
import { useState } from "react";
import {
    Smartphone,
    Users,
    Tag,
    Package,
    Briefcase,
    CheckCircle2,
    Circle,
    Sparkles,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    steps: {
        whatsapp: boolean;
        team: boolean;
        tags: boolean;
        products: boolean;
        deals: boolean;
    };
}

interface StepCfg {
    key: keyof Props["steps"];
    label: string;
    description: string;
    icon: typeof Smartphone;
    href: string;
    cta: string;
}

const STEPS: StepCfg[] = [
    {
        key: "whatsapp",
        label: "Conectar WhatsApp",
        description: "Conecte uma instancia para receber leads e responder clientes pela ferramenta.",
        icon: Smartphone,
        href: "/settings/whatsapp",
        cta: "Conectar",
    },
    {
        key: "team",
        label: "Convidar equipe",
        description: "Convide seus vendedores para que cada lead caia no funil deles automaticamente.",
        icon: Users,
        href: "/settings/team",
        cta: "Convidar",
    },
    {
        key: "tags",
        label: "Personalizar etiquetas",
        description: "Crie etiquetas para classificar leads (ex: Quente, Premium, Recompra).",
        icon: Tag,
        href: "/settings/tags",
        cta: "Configurar",
    },
    {
        key: "products",
        label: "Cadastrar produtos",
        description: "Cadastre seus produtos/servicos para vincula-los aos negocios e medir performance.",
        icon: Package,
        href: "/settings/products",
        cta: "Cadastrar",
    },
    {
        key: "deals",
        label: "Criar primeiro deal",
        description: "Crie manualmente um deal de exemplo ou aguarde uma mensagem nova no WhatsApp.",
        icon: Briefcase,
        href: "/leads",
        cta: "Abrir kanban",
    },
];

export default function OnboardingBanner({ steps }: Props) {
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    const done = Object.values(steps).filter(Boolean).length;
    const total = STEPS.length;
    const progress = Math.round((done / total) * 100);

    return (
        <div className="bg-white rounded-2xl border border-indigo-100 shadow-md p-6 mb-8">
            <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-slate-900">
                            Configure seu CRM
                        </h2>
                        <p className="text-xs text-slate-500">
                            Conclua os passos abaixo para extrair o melhor da ferramenta. {done}/{total} feito.
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setDismissed(true)}
                    className="-mr-2 -mt-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    aria-label="Fechar"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Barra de progresso */}
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-5">
                <div
                    className="h-full bg-indigo-600 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                />
            </div>

            {/* Lista de passos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {STEPS.map((step) => {
                    const done = steps[step.key];
                    const Icon = step.icon;
                    return (
                        <Link
                            key={step.key}
                            href={step.href}
                            className={cn(
                                "group flex items-start gap-3 p-3 rounded-lg border transition-all",
                                done
                                    ? "bg-emerald-50/50 border-emerald-200"
                                    : "bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30"
                            )}
                        >
                            <div className="shrink-0 mt-0.5">
                                {done ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                ) : (
                                    <Circle className="w-5 h-5 text-slate-300 group-hover:text-indigo-400" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <Icon className={cn(
                                        "w-3.5 h-3.5",
                                        done ? "text-emerald-600" : "text-slate-400"
                                    )} />
                                    <span className={cn(
                                        "text-sm font-semibold",
                                        done ? "text-emerald-800 line-through opacity-70" : "text-slate-800"
                                    )}>
                                        {step.label}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                    {step.description}
                                </p>
                                {!done && (
                                    <span className="inline-block mt-1.5 text-[11px] font-bold text-indigo-600 group-hover:text-indigo-700">
                                        {step.cta} →
                                    </span>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
