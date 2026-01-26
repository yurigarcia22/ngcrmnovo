'use client';

import { useImportStore } from './store';
import { Button } from '@/components/ui/simple-ui';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export function ImportPreview() {
    const { rawRows, headers, setStep, setRawData, reset } = useImportStore();
    const [page, setPage] = useState(0);
    const ROWS_PER_PAGE = 50;

    const visibleRows = useMemo(() => {
        return rawRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
    }, [rawRows, page]);

    const totalPages = Math.ceil(rawRows.length / ROWS_PER_PAGE);

    // Basic empty check highlighter
    const isEmpty = (val: any) => !val || String(val).trim() === '';

    const handleNext = () => setStep('mapping');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Pré-visualização de Dados</h2>
                    <p className="text-sm text-slate-500">
                        Total de {rawRows.length} linhas detectadas. Revise se as colunas estão alinhadas corretamente.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={reset}>
                        Cancelar
                    </Button>
                    <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 text-white">
                        Confirmar e Mapear Colunas
                    </Button>
                </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto max-h-[600px] relative">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 border-b border-r border-slate-200 w-12 text-center bg-slate-100">#</th>
                                {headers.map((h, i) => (
                                    <th key={i} className="p-3 border-b border-r border-slate-200 min-w-[150px] whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visibleRows.map((row, rIndex) => {
                                const globalIndex = page * ROWS_PER_PAGE + rIndex + 1;
                                // Simple "is empty row" check (if necessary)
                                const isRowEmpty = row.every(isEmpty);

                                if (isRowEmpty) return null; // Skip visually empty rows if needed, or keep for fidelity

                                return (
                                    <tr key={rIndex} className="hover:bg-slate-50 group">
                                        <td className="p-2 border-r border-slate-100 text-center text-xs text-slate-400 bg-slate-50/50">
                                            {globalIndex}
                                        </td>
                                        {headers.map((_, cIndex) => {
                                            const cellValue = row[cIndex];
                                            return (
                                                <td
                                                    key={cIndex}
                                                    className={`
                                                        p-2 border-r border-slate-100 max-w-[200px] truncate
                                                        ${isEmpty(cellValue) ? 'bg-red-50/30 italic text-slate-300' : 'text-slate-700'}
                                                    `}
                                                    title={String(cellValue)}
                                                >
                                                    {isEmpty(cellValue) ? '(vazio)' : cellValue}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination (Simple) */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                        Página {page + 1} de {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                        >
                            Anterior
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Próxima
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex gap-4 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                    <span className="font-bold">Dica:</span> As células marcadas como <span className="text-slate-300 italic">(vazio)</span> indicam ausência de dados na célula original.
                    O sistema manteve o alinhamento correto. Se perceber que uma coluna inteira está deslocada, verifique o arquivo original.
                </div>
            </div>
        </div>
    );
}
