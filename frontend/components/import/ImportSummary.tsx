'use client';

import { useImportStore } from './store';
import { Button } from '@/components/ui/simple-ui';
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// Linhas por chamada da rota: um JSON so com a planilha inteira batia no limite
// de corpo da requisicao e no timeout da funcao.
const ROWS_PER_REQUEST = 500;

type ImportTotals = { imported: number; duplicates: number; invalid: number; failed: number };
const EMPTY_TOTALS: ImportTotals = { imported: 0, duplicates: 0, invalid: 0, failed: 0 };

export function ImportSummary() {
    const { rawRows, mapping, defaults, reset, setStep } = useImportStore(); // Need headers and rawRows actually
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [totals, setTotals] = useState<ImportTotals | null>(null);
    const [rowErrors, setRowErrors] = useState<string[]>([]);
    const [finished, setFinished] = useState(false);
    const router = useRouter();

    const handleImport = async () => {
        setImporting(true);
        setFinished(false);
        setRowErrors([]);

        const { headers, rawRows: rows, file } = useImportStore.getState();
        const chunks: any[][][] = [];
        for (let i = 0; i < rows.length; i += ROWS_PER_REQUEST) {
            chunks.push(rows.slice(i, i + ROWS_PER_REQUEST));
        }

        const acc: ImportTotals = { ...EMPTY_TOTALS };
        const errorsAcc: string[] = [];
        let batchId: string | undefined;
        setTotals({ ...acc });
        setProgress({ done: 0, total: chunks.length });

        try {
            for (let c = 0; c < chunks.length; c++) {
                const payload = {
                    headers,
                    rows: chunks[c],
                    mapping,
                    defaults,
                    batchId,
                    rowOffset: c * ROWS_PER_REQUEST,
                    totalRows: rows.length,
                    final: c === chunks.length - 1,
                    fileName: file?.name,
                };

                const res = await fetch('/api/cold-leads/import/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json().catch(() => ({}));

                // soma o que o lote conseguiu gravar mesmo quando ele volta com erro
                acc.imported += data.imported ?? 0;
                acc.duplicates += data.duplicates ?? 0;
                acc.invalid += data.invalid ?? 0;
                acc.failed += data.failed ?? 0;
                if (Array.isArray(data.errors)) errorsAcc.push(...data.errors);
                if (data.batchId) batchId = data.batchId;
                setTotals({ ...acc });
                setRowErrors([...errorsAcc]);
                setProgress({ done: c + 1, total: chunks.length });

                if (!res.ok) {
                    throw new Error(
                        `${data.error || 'Falha na importação'} (lote ${c + 1} de ${chunks.length}). ` +
                        `${acc.imported} leads já tinham sido importados.`
                    );
                }
            }

            setFinished(true);
            const extras = [
                acc.duplicates > 0 ? `${acc.duplicates} duplicados ignorados` : '',
                acc.invalid > 0 ? `${acc.invalid} linhas inválidas` : '',
                acc.failed > 0 ? `${acc.failed} com erro ao gravar` : '',
            ].filter(Boolean).join(', ');
            toast.success(`Importação concluída! ${acc.imported} leads importados${extras ? ` (${extras})` : ''}.`);

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setImporting(false);
        }
    };

    const handleGoToColdCall = () => {
        reset();
        router.push('/cold-call');
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
                    <span className="text-4xl font-bold text-slate-600 mb-2">{Math.ceil(rawRows.length / ROWS_PER_REQUEST)}</span>
                    <span className="text-sm text-slate-800 font-medium">Lotes de envio ({ROWS_PER_REQUEST} linhas cada)</span>
                </div>
            </div>

            {totals && (
                <div className="bg-white p-6 border border-slate-200 rounded-lg space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold">Resultado</h3>
                        {progress && (
                            <span className="text-sm text-slate-500">
                                {finished ? 'Concluído' : `Lote ${progress.done} de ${progress.total}`}
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-emerald-600">{totals.imported}</div>
                            <div className="text-xs text-slate-500">Inseridos</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-amber-600">{totals.duplicates}</div>
                            <div className="text-xs text-slate-500">Duplicados (ignorados)</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-rose-600">{totals.invalid}</div>
                            <div className="text-xs text-slate-500">Inválidos</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-slate-600">{totals.failed}</div>
                            <div className="text-xs text-slate-500">Erro ao gravar</div>
                        </div>
                    </div>
                    {rowErrors.length > 0 && (
                        <div className="border-t border-slate-100 pt-3">
                            <p className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                                <AlertTriangle size={16} className="text-amber-500" /> Linhas com problema
                            </p>
                            <ul className="max-h-48 overflow-y-auto text-xs text-slate-600 space-y-1">
                                {rowErrors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            <div className="bg-white p-6 border border-slate-200 rounded-lg">
                <h3 className="font-bold mb-4">Checklist</h3>
                <ul className="space-y-2 text-sm text-slate-600">
                    <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Arquivo analisado sem deslocamentos</li>
                    <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Validação de campos obrigatórios</li>
                    <li className="flex items-center gap-2"><CheckCircle size={16} className="text-green-500" /> Defaults configurados ({defaults.tags.length} tags)</li>
                </ul>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                {finished ? (
                    <Button onClick={handleGoToColdCall} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[150px]">
                        Ir para o Cold Call
                    </Button>
                ) : (
                    <>
                        <Button variant="outline" onClick={() => setStep('defaults')} disabled={importing}>
                            Voltar
                        </Button>
                        <Button onClick={handleImport} className="bg-green-600 hover:bg-green-700 text-white min-w-[150px]" disabled={importing}>
                            {importing ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            {importing
                                ? (progress ? `Importando ${progress.done}/${progress.total}...` : 'Importando...')
                                : 'Finalizar Importação'}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}
