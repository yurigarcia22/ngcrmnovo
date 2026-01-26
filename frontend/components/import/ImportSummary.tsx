'use client';

import { useImportStore } from './store';
import { Button } from '@/components/ui/simple-ui';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function ImportSummary() {
    const { rawRows, mapping, defaults, reset, setStep } = useImportStore(); // Need headers and rawRows actually
    const [importing, setImporting] = useState(false);
    const router = useRouter();

    const handleImport = async () => {
        setImporting(true);
        // Build payload
        // Ideally we pass everything to backend and let it process
        // But store has "rawRows". Sending huge payload might be issue for serverless?
        // Let's assume max 1000 rows for now or chunk it. 
        // For MVP/Prototype, send all.

        try {
            const { headers, rawRows: rows } = useImportStore.getState();

            const payload = {
                headers,
                rows,
                mapping,
                defaults
            };

            const res = await fetch('/api/cold-leads/import/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Falha na importação');

            toast.success(`Sucesso! ${data.imported} leads importados.`);
            reset();
            router.push('/cold-call');

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setImporting(false);
        }
    };

    const mappedCount = Object.keys(mapping).length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Resumo da Importação</h2>
                    <p className="text-sm text-slate-500">
                        Revise os detalhes antes de finalizar.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex flex-col items-center justify-center text-center">
                    <span className="text-4xl font-bold text-blue-600 mb-2">{rawRows.length}</span>
                    <span className="text-sm text-blue-800 font-medium">Linhas a processar</span>
                </div>
                <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-100 flex flex-col items-center justify-center text-center">
                    <span className="text-4xl font-bold text-emerald-600 mb-2">{mappedCount}</span>
                    <span className="text-sm text-emerald-800 font-medium">Colunas mapeadas</span>
                </div>
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                    <span className="text-4xl font-bold text-slate-600 mb-2">{defaults.status.replace('_', ' ')}</span>
                    <span className="text-sm text-slate-800 font-medium">Status Inicial</span>
                </div>
            </div>

            <div className="bg-white p-6 border border-slate-200 rounded-lg">
                <h3 className="font-bold mb-4">Checklist</h3>
                <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Arquivo analisado sem deslocamentos</li>
                    <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Validação de campos obrigatórios</li>
                    <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Defaults configurados ({defaults.tags.length} tags)</li>
                </ul>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button variant="outline" onClick={() => setStep('defaults')} disabled={importing}>
                    Voltar
                </Button>
                <Button onClick={handleImport} className="bg-green-600 hover:bg-green-700 text-white min-w-[150px]" disabled={importing}>
                    {importing ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                    {importing ? 'Importando...' : 'Finalizar Importação'}
                </Button>
            </div>
        </div>
    );
}
