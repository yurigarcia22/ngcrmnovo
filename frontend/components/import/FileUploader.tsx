'use client';

import { useCallback, useState } from 'react';
// import { useDropzone } from 'react-dropzone'; // Removed unused dependency
// Since react-dropzone isn't in package.json shown before, I'll use a simple input or assume I can install it?
// Let's implement a clean native solution to avoid dependency issues for now, or use what we have.
// Actually, package.json showed basic dependencies. I'll stick to native drag-n-drop + hidden input to be safe and robust.

import { Upload, FileSpreadsheet, AlertCircle, Loader2, FileType } from 'lucide-react';
import { Button } from '@/components/ui/simple-ui';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useImportStore } from './store';

export function FileUploader() {
    const { setFile, setRawData, setStep } = useImportStore();
    const [isDragOver, setIsDragOver] = useState(false);
    const [loading, setLoading] = useState(false);

    const processFile = useCallback((file: File) => {
        setLoading(true);
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' }); // 'binary' or 'array'
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // CRITICAL: Anti-shift parsing
                // valid: true ensures we get empty cells as null/undefined instead of skipping
                // header: 1 gives us an array of arrays [[], [], []]
                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

                if (!rawData || rawData.length === 0) {
                    toast.error('Arquivo vazio.');
                    setLoading(false);
                    return;
                }

                // Detect headers
                const headers = rawData[0].map((h: any) => String(h || '').trim());

                // Remove header row from data
                // const rows = rawData.slice(1); // We keep it all for now or slice? 
                // Let's keep rawRows as EVERYTHING including header for preview index consistency, 
                // but usually we want data. Let's slice for now to simplify "rows".
                const rows = rawData.slice(1);

                if (headers.length === 0) {
                    toast.error('Não conseguimos detectar o cabeçalho.');
                    setLoading(false);
                    return;
                }

                // Ensure all rows have same length as header (pad with '')
                const normalizedRows = rows.map(row => {
                    const newRow = new Array(headers.length).fill('');
                    row.forEach((cell: any, index: number) => {
                        if (index < headers.length) {
                            newRow[index] = cell;
                        }
                    });
                    return newRow;
                });

                setFile(file);
                // Store headers and normalized rows
                setRawData(normalizedRows, headers);

                toast.success(`Arquivo carregado! ${normalizedRows.length} linhas detectadas.`);
                setStep('preview');

            } catch (error) {
                console.error(error);
                toast.error('Erro ao processar o arquivo. Verifique se é um Excel válido.');
            } finally {
                setLoading(false);
            }
        };

        reader.readAsBinaryString(file);
    }, [setFile, setRawData, setStep]);

    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    }, [processFile]);

    const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const downloadTemplate = () => {
        const headers = ['Nome', 'Telefone', 'Nicho', 'Email', 'Site', 'Instagram', 'Notas'];
        const example = ['Empresa Exemplo', '11999999999', 'Tecnologia', 'contato@exemplo.com', 'www.exemplo.com', '@exemplo', 'Cliente potencial'];

        // Use XLSX to write file
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Modelo");
        XLSX.writeFile(wb, "modelo_importacao_leads.xlsx");
    };

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div
                className={`
                    border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
                    ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}
                    ${loading ? 'opacity-50 pointer-events-none' : ''}
                `}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                onClick={() => document.getElementById('file-upload-input')?.click()}
            >
                <input
                    type="file"
                    id="file-upload-input"
                    className="hidden"
                    accept=".xlsx, .xls, .csv"
                    onChange={onFileSelect}
                />

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-6">
                        <Loader2 className="h-10 w-10 text-blue-600 animate-spin mb-4" />
                        <p className="text-slate-600 font-medium">Analisando arquivo...</p>
                        <p className="text-slate-400 text-sm mt-1">Isso garante que nenhuma coluna saia do lugar.</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center space-y-4">
                        <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
                            <Upload size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">
                            Arraste seu arquivo Excel aqui
                        </h3>
                        <p className="text-slate-500 text-sm max-w-sm mx-auto">
                            Suporta .xlsx, .xls e .csv. O sistema analisará a estrutura para evitar erros de alinhamento.
                        </p>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white mt-4">
                            Selecionar Arquivo
                        </Button>
                    </div>
                )}
            </div>

            <div className="text-center mt-4">
                <button
                    onClick={downloadTemplate}
                    className="text-sm text-blue-600 hover:text-blue-800 underline flex items-center justify-center gap-1 mx-auto"
                >
                    <FileSpreadsheet className="h-4 w-4" />
                    Baixar Modelo de Planilha
                </button>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center text-center">
                    <FileSpreadsheet className="h-6 w-6 text-green-600 mb-2" />
                    <h4 className="font-bold text-sm text-slate-700">Excel / CSV</h4>
                    <p className="text-xs text-slate-500 mt-1">Formatos padrão de mercado</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center text-center">
                    <FileType className="h-6 w-6 text-orange-500 mb-2" />
                    <h4 className="font-bold text-sm text-slate-700">Anti-Deslocamento</h4>
                    <p className="text-xs text-slate-500 mt-1">Células vazias não quebram o layout</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 flex flex-col items-center text-center">
                    <AlertCircle className="h-6 w-6 text-blue-500 mb-2" />
                    <h4 className="font-bold text-sm text-slate-700">Validação Real</h4>
                    <p className="text-xs text-slate-500 mt-1">Identifique erros antes de importar</p>
                </div>
            </div>
        </div>
    );
}
