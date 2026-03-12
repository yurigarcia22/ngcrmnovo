"use client";

import { Building2, Save, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button, Input } from "@/components/ui/simple-ui";
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
                toast.error("Erro ao carregar os dados da empresa.");
            }
            setLoading(false);
        }
        load();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        const res = await updateCompanyName(name);
        if (res.success) {
            toast.success("Nome da empresa atualizado com sucesso!");
            router.refresh(); // To force refresh of layouts if any
        } else {
            toast.error(res.error || "Falha ao atualizar o nome da empresa.");
        }
        setSaving(false);
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
                <Building2 className="text-blue-600" />
                Configurações da Empresa
            </h1>
            <p className="text-gray-500 mb-8">Gerencie os dados da sua organização. O nome configurado aqui será utilizado em todo o sistema (como no Dashboard).</p>

            <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-800 mb-6 border-b pb-4">Identidade da Empresa</h3>
                
                {loading ? (
                    <div className="flex justify-center items-center py-10">
                        <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                    </div>
                ) : (
                    <div className="max-w-md space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700">Nome da Empresa</label>
                            <Input 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Acumens Corp"
                                className="w-full text-sm h-11 bg-slate-50 focus:bg-white"
                            />
                            <p className="text-xs text-slate-500 mt-1">Este nome será exibido no Dashboard e em relatórios.</p>
                        </div>

                        <div className="pt-4">
                            <Button 
                                onClick={handleSave} 
                                disabled={saving || !name.trim()}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 h-11 w-full sm:w-auto flex items-center gap-2"
                            >
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                Salvar Alterações
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
