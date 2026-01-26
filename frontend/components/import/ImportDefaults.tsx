'use client';

import { useImportStore } from './store';
import { Button, Input } from '@/components/ui/simple-ui'; // assuming simple-ui has Select or we use native
import { useState, useEffect } from 'react';
import { getMembers } from '@/app/(protected)/settings/team/actions'; // Reuse existing action

export function ImportDefaults() {
    const { defaults, setDefaults, setStep, reset } = useImportStore();
    const [members, setMembers] = useState<any[]>([]);

    useEffect(() => {
        getMembers().then(res => {
            if (res.success && res.profiles) {
                setMembers(res.profiles);
            }
        });
    }, []);

    const handleNext = () => setStep('summary');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Configurações Padrão</h2>
                    <p className="text-sm text-slate-500">
                        Defina valores que serão aplicados a todos os leads desta importação.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={reset}>Cancelar</Button>
                    <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 text-white">
                        Próximo: Revisão
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-lg border border-slate-200">

                {/* Owner */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Responsável</label>
                    <select
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm"
                        value={defaults.ownerId}
                        onChange={(e) => setDefaults({ ownerId: e.target.value })}
                    >
                        <option value="">-- Sem responsável (Opcional) --</option>
                        {members.map(m => (
                            <option key={m.id} value={m.id}>{m.full_name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500">
                        Se a planilha tiver uma coluna de responsável mapeada, este valor será usado apenas onde estiver vazio (se Sobrescrever estiver desativado).
                    </p>
                </div>

                {/* Status */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Status Inicial</label>
                    <select
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm"
                        value={defaults.status}
                        onChange={(e) => setDefaults({ status: e.target.value })}
                    >
                        <option value="novo_lead">Novo Lead</option>
                        <option value="ligacao_feita">Ligação Feita</option>
                        <option value="contato_realizado">Contato Realizado</option>
                        {/* Other statuses */}
                    </select>
                </div>

                {/* Tags */}
                <div className="space-y-2 col-span-2">
                    <label className="text-sm font-medium text-slate-700">Tags (Separadas por vírgula)</label>
                    <Input
                        placeholder="Ex: Importação Jan/26, Evento X"
                        value={defaults.tags.join(', ')}
                        onChange={(e) => setDefaults({ tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                    />
                </div>
            </div>
        </div>
    );
}
