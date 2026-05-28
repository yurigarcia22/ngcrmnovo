'use client';

import { useImportStore } from './store';
import { Button, Input } from '@/components/ui/simple-ui'; // assuming simple-ui has Select or we use native
import { useState, useEffect, useMemo } from 'react';
import { getMembers } from '@/app/(protected)/settings/team/actions'; // Reuse existing action
import { getColdCallPipelinesWithStages } from '@/app/(protected)/cold-call/actions';

export function ImportDefaults() {
    const { defaults, setDefaults, setStep, reset } = useImportStore();
    const [members, setMembers] = useState<any[]>([]);
    const [pipelines, setPipelines] = useState<any[]>([]);

    useEffect(() => {
        getMembers().then(res => {
            if (res.success && res.profiles) {
                setMembers(res.profiles);
            }
        });
        getColdCallPipelinesWithStages().then(res => {
            if (res.success && res.data) {
                setPipelines(res.data);
                // Pre-seleciona o funil padrao se nenhum escolhido
                if (!defaults.pipelineId && res.data.length > 0) {
                    const def = res.data.find((p: any) => p.is_default) ?? res.data[0];
                    const firstStage = (def.stages ?? [])[0];
                    setDefaults({ pipelineId: String(def.id), stageId: firstStage ? String(firstStage.id) : '' });
                }
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectedPipeline = useMemo(
        () => pipelines.find((p: any) => String(p.id) === String(defaults.pipelineId)),
        [pipelines, defaults.pipelineId],
    );
    const stages = selectedPipeline?.stages ?? [];

    const handlePipelineChange = (pid: string) => {
        const pipe = pipelines.find((p: any) => String(p.id) === String(pid));
        const firstStage = (pipe?.stages ?? [])[0];
        setDefaults({ pipelineId: pid, stageId: firstStage ? String(firstStage.id) : '' });
    };

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

                {/* Funil (cold_call) */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Funil de Prospecção</label>
                    <select
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm"
                        value={defaults.pipelineId}
                        onChange={(e) => handlePipelineChange(e.target.value)}
                    >
                        {pipelines.length === 0 && <option value="">Carregando funis...</option>}
                        {pipelines.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500">
                        Escolha o funil de cold-call (ex: Funil Webinar) onde os leads vão entrar.
                    </p>
                </div>

                {/* Etapa do Funil */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Etapa Inicial</label>
                    <select
                        className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm"
                        value={defaults.stageId}
                        onChange={(e) => setDefaults({ stageId: e.target.value })}
                    >
                        {stages.length === 0 && <option value="">--</option>}
                        {stages.map((s: any) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500">
                        Todos os leads importados começam nesta etapa do funil.
                    </p>
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
