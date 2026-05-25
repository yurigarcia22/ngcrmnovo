import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

interface Props {
    searchParams: Promise<{ module?: string; from?: string }>;
}

export default async function ModuleDisabledPage({ searchParams }: Props) {
    const params = await searchParams;
    const moduleLabel = params.module ?? "este recurso";

    return (
        <div className="h-full flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-8 py-8 text-center space-y-4">
                    <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
                        <Lock className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">
                            Recurso indisponivel
                        </h1>
                        <p className="text-sm text-slate-600 mt-2">
                            O modulo <strong>{moduleLabel}</strong> nao esta ativo
                            para sua empresa. Entre em contato com o administrador
                            da plataforma para liberar.
                        </p>
                    </div>

                    <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Voltar ao Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
