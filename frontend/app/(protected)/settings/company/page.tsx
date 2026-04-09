"use client";

import { Building2, Save, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/simple-ui";
import { PageHeader } from "@/components/ui/page-header";
import { getCompanyDetails, updateCompanyName } from "./actions";
import { useRouter } from "next/navigation";

export default function CompanySettingsPage() {
    const router = useRouter();
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        async function load() {
            setLoading(true);
            const res = await getCompanyDetails();
            if (res.success && res.name) {
                setName(res.name);
            } else {
                toast.error("Erro ao carregar dados da empresa");
            }
            setLoading(false);
        }
        load();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        const res = await updateCompanyName(name);
        if (res.success) {
            toast.success("Nome da empresa atualizado");
            router.refresh();
        } else {
            toast.error("Erro ao atualizar", res.error || undefined);
        }
        setSaving(false);
    };

    return (
        <div className="max-w-4xl mx-auto">
            <PageHeader
                title="Empresa"
                description="Configure os dados da sua organizacao. O nome sera exibido em todo o sistema."
                icon={<Building2 className="w-5 h-5" />}
                breadcrumbs={[
                    { label: "Configuracoes", href: "/settings" },
                    { label: "Empresa" },
                ]}
            />

            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <h3 className="text-base font-bold text-slate-800 mb-5 pb-3 border-b border-slate-100">Identidade da Empresa</h3>

                {loading ? (
                    <div className="max-w-md space-y-6">
                        <div className="space-y-2">
                            <div className="h-4 w-32 skeleton" />
                            <div className="h-11 w-full skeleton" />
                            <div className="h-3 w-64 skeleton" />
                        </div>
                        <div className="h-11 w-40 skeleton" />
                    </div>
                ) : (
                    <div className="max-w-md space-y-6">
                        <div className="space-y-2">
                            <label htmlFor="company-name" className="text-sm font-semibold text-slate-700">
                                Nome da Empresa
                            </label>
                            <Input
                                id="company-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Acumens Corp"
                                className="w-full text-sm h-11"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Este nome sera exibido no Dashboard e em relatorios.
                            </p>
                        </div>

                        <div>
                            <Button
                                onClick={handleSave}
                                disabled={saving || !name.trim()}
                                variant="default"
                                size="lg"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Salvar alteracoes
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
