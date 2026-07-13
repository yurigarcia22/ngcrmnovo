"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
    ArrowLeft, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { importLeadRows, type NovoLeadInput } from "../actions";

type Step = "upload" | "mapear" | "resumo" | "concluido";

// Campos do modulo e sinonimos pra auto-mapear pelo cabecalho da planilha
const FIELDS: { key: keyof NovoLeadInput; label: string; required?: boolean; synonyms: string[] }[] = [
    { key: "empresa", label: "Empresa", required: true, synonyms: ["empresa", "nome", "razao social", "razao", "name", "company"] },
    { key: "cnpj", label: "CNPJ", synonyms: ["cnpj", "documento", "cpf/cnpj"] },
    { key: "site", label: "Site", synonyms: ["site", "website", "url", "pagina", "link"] },
    { key: "instagram", label: "Instagram", synonyms: ["instagram", "insta", "ig", "@"] },
    { key: "telefone", label: "Telefone", synonyms: ["telefone", "whatsapp", "celular", "fone", "phone", "zap"] },
    { key: "cidade", label: "Cidade", synonyms: ["cidade", "municipio", "city", "local"] },
    { key: "nicho", label: "Nicho", synonyms: ["nicho", "segmento", "categoria", "ramo", "setor", "atividade"] },
];

const IGNORAR = "__ignorar__";

function normalizeHeader(h: string): string {
    return h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function autoMap(headers: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    const usados = new Set<number>();
    for (const field of FIELDS) {
        const idx = headers.findIndex((h, i) => {
            if (usados.has(i)) return false;
            const n = normalizeHeader(h);
            return field.synonyms.some((s) => n === s || n.includes(s));
        });
        if (idx >= 0) {
            map[field.key] = String(idx);
            usados.add(idx);
        } else {
            map[field.key] = IGNORAR;
        }
    }
    return map;
}

export default function ImportarProspeccaoPage() {
    const router = useRouter();
    const [step, setStep] = React.useState<Step>("upload");
    const [loading, setLoading] = React.useState(false);
    const [dragOver, setDragOver] = React.useState(false);
    const [headers, setHeaders] = React.useState<string[]>([]);
    const [rows, setRows] = React.useState<any[][]>([]);
    const [mapping, setMapping] = React.useState<Record<string, string>>({});
    const [progress, setProgress] = React.useState(0);
    const [resultado, setResultado] = React.useState<{ importados: number; ignorados: number; duplicados: number } | null>(null);

    // ---- Passo 1: upload e parse (anti-deslocamento: defval preenche celulas vazias) ----
    const processFile = React.useCallback((file: File) => {
        setLoading(true);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target?.result, { type: "binary" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
                if (!raw || raw.length < 2) {
                    toast.error("Arquivo vazio ou sem linhas de dados.");
                    return;
                }
                const hs = raw[0].map((h: any) => String(h ?? "").trim());
                const dataRows = raw.slice(1).map((row) => {
                    const nr = new Array(hs.length).fill("");
                    row.forEach((cell: any, i: number) => { if (i < hs.length) nr[i] = cell; });
                    return nr;
                }).filter((r) => r.some((c: any) => String(c ?? "").trim() !== ""));
                if (hs.filter(Boolean).length === 0) {
                    toast.error("Não conseguimos detectar o cabeçalho.");
                    return;
                }
                setHeaders(hs);
                setRows(dataRows);
                setMapping(autoMap(hs));
                setStep("mapear");
                toast.success(`Arquivo carregado! ${dataRows.length} linhas detectadas.`);
            } catch (err) {
                console.error(err);
                toast.error("Erro ao processar o arquivo. Verifique se é um Excel/CSV válido.");
            } finally {
                setLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    }, []);

    function downloadTemplate() {
        const hs = ["Empresa", "CNPJ", "Site", "Instagram", "Telefone", "Cidade", "Nicho"];
        const exemplo = ["Empresa Exemplo", "00.000.000/0001-00", "https://exemplo.com.br", "@exemplo", "31999990000", "Belo Horizonte", "Odontologia"];
        const ws = XLSX.utils.aoa_to_sheet([hs, exemplo]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Modelo");
        XLSX.writeFile(wb, "modelo_prospeccao.xlsx");
    }

    // ---- Montagem das linhas mapeadas + validacao ----
    const parsed = React.useMemo(() => {
        if (step === "upload") return { validas: [] as NovoLeadInput[], semEmpresa: 0, duplicadas: 0 };
        const col = (key: string) => (mapping[key] !== IGNORAR ? parseInt(mapping[key], 10) : -1);
        const idx = {
            empresa: col("empresa"), cnpj: col("cnpj"), site: col("site"), instagram: col("instagram"),
            telefone: col("telefone"), cidade: col("cidade"), nicho: col("nicho"),
        };
        const get = (row: any[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
        const seen = new Set<string>();
        const validas: NovoLeadInput[] = [];
        let semEmpresa = 0, duplicadas = 0;
        for (const row of rows) {
            const empresa = get(row, idx.empresa);
            if (!empresa) { semEmpresa++; continue; }
            const cnpj = get(row, idx.cnpj);
            const telefone = get(row, idx.telefone);
            const chave = (empresa.toLowerCase() + "|" + cnpj.replace(/\D/g, "") + "|" + telefone.replace(/\D/g, "")).trim();
            if (seen.has(chave)) { duplicadas++; continue; }
            seen.add(chave);
            validas.push({
                empresa,
                cnpj: cnpj || undefined,
                site: get(row, idx.site) || undefined,
                instagram: get(row, idx.instagram) || undefined,
                telefone: telefone || undefined,
                cidade: get(row, idx.cidade) || undefined,
                nicho: get(row, idx.nicho) || undefined,
            });
        }
        return { validas, semEmpresa, duplicadas };
    }, [step, rows, mapping]);

    // ---- Passo 3: importar em lotes ----
    async function importar() {
        if (parsed.validas.length === 0) { toast.error("Nenhuma linha válida pra importar."); return; }
        setLoading(true);
        setProgress(0);
        let importados = 0;
        try {
            const CHUNK = 300;
            for (let i = 0; i < parsed.validas.length; i += CHUNK) {
                const r = await importLeadRows(parsed.validas.slice(i, i + CHUNK));
                if (!r.success) throw new Error(r.error || "Falha na importação.");
                importados += r.total || 0;
                setProgress(Math.min(100, Math.round(((i + CHUNK) / parsed.validas.length) * 100)));
            }
            setResultado({ importados, ignorados: parsed.semEmpresa, duplicados: parsed.duplicadas });
            setStep("concluido");
            router.refresh();
        } catch (e: any) {
            toast.error(e.message || "Falha na importação.");
        } finally {
            setLoading(false);
        }
    }

    const progressWidth = { upload: "w-[15%]", mapear: "w-[55%]", resumo: "w-[85%]", concluido: "w-full" }[step];

    return (
        <div className="min-h-screen bg-slate-50 p-6 pb-24">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/prospeccao" className="text-slate-400 hover:text-slate-600 transition-colors" aria-label="Voltar pra Prospecção">
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Importar leads pra Prospecção</h1>
                        <p className="text-sm text-slate-500">Suba a planilha, confira o mapeamento das colunas e importe. A pesquisa (dossiê) roda depois, na fila.</p>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-full h-3 w-full overflow-hidden flex">
                    <div className={`h-full bg-indigo-600 transition-all duration-500 ${progressWidth}`}></div>
                </div>

                <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8 min-h-[380px]">
                    {step === "upload" && (
                        <div className="w-full max-w-2xl mx-auto">
                            <div
                                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${dragOver ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"} ${loading ? "opacity-50 pointer-events-none" : ""}`}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
                                onClick={() => document.getElementById("prospeccao-file-input")?.click()}
                            >
                                <input
                                    type="file"
                                    id="prospeccao-file-input"
                                    className="hidden"
                                    accept=".xlsx, .xls, .csv"
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
                                />
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center py-6">
                                        <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mb-4" />
                                        <p className="text-slate-600 font-medium">Analisando arquivo...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center space-y-4">
                                        <div className="h-16 w-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-2">
                                            <Upload size={32} />
                                        </div>
                                        <h3 className="text-xl font-bold text-slate-800">Arraste sua planilha aqui</h3>
                                        <p className="text-slate-500 text-sm max-w-sm mx-auto">
                                            Suporta .xlsx, .xls e .csv. Células vazias não desalinham as colunas.
                                        </p>
                                        <Button className="mt-2">Selecionar arquivo</Button>
                                    </div>
                                )}
                            </div>
                            <div className="text-center mt-4">
                                <button
                                    onClick={downloadTemplate}
                                    className="text-sm text-indigo-600 hover:text-indigo-800 underline flex items-center justify-center gap-1 mx-auto"
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    Baixar modelo de planilha
                                </button>
                            </div>
                        </div>
                    )}

                    {step === "mapear" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-base font-semibold text-slate-800">Mapeie as colunas</h3>
                                <p className="text-sm text-slate-500 mt-0.5">Detectamos {rows.length} linhas. Confira se cada campo aponta pra coluna certa da sua planilha.</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {FIELDS.map((f) => (
                                    <label key={f.key} className="flex flex-col gap-1.5">
                                        <span className="text-xs font-medium text-slate-600">
                                            {f.label}{f.required && <span className="text-rose-600"> *</span>}
                                        </span>
                                        <select
                                            value={mapping[f.key] ?? IGNORAR}
                                            onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                                            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                        >
                                            <option value={IGNORAR}>Ignorar</option>
                                            {headers.map((h, i) => (
                                                <option key={i} value={String(i)}>{h || `Coluna ${i + 1}`}</option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                            </div>

                            <div>
                                <h4 className="text-sm font-semibold text-slate-800 mb-2">Prévia (5 primeiras linhas)</h4>
                                <div className="overflow-x-auto rounded-lg border border-slate-200">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 text-left">
                                                {FIELDS.filter((f) => mapping[f.key] !== IGNORAR).map((f) => (
                                                    <th key={f.key} className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{f.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.slice(0, 5).map((row, ri) => (
                                                <tr key={ri} className="border-t border-slate-100">
                                                    {FIELDS.filter((f) => mapping[f.key] !== IGNORAR).map((f) => (
                                                        <td key={f.key} className="px-3 py-2 text-slate-600 whitespace-nowrap max-w-[220px] truncate">
                                                            {String(row[parseInt(mapping[f.key], 10)] ?? "")}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="flex justify-between">
                                <Button variant="ghost" onClick={() => { setStep("upload"); setHeaders([]); setRows([]); }}>Voltar</Button>
                                <Button onClick={() => setStep("resumo")} disabled={mapping.empresa === IGNORAR}>
                                    Continuar
                                </Button>
                            </div>
                            {mapping.empresa === IGNORAR && (
                                <p className="text-xs text-rose-600 text-right">Mapeie a coluna Empresa pra continuar.</p>
                            )}
                        </div>
                    )}

                    {step === "resumo" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-base font-semibold text-slate-800">Resumo da importação</h3>
                                <p className="text-sm text-slate-500 mt-0.5">Confira os números antes de confirmar.</p>
                            </div>
                            <div className="flex items-stretch divide-x divide-slate-200 rounded-xl border border-slate-200">
                                <div className="flex-1 px-5 py-4">
                                    <div className="text-2xl font-bold text-emerald-700">{parsed.validas.length}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">Prontas pra importar</div>
                                </div>
                                <div className="flex-1 px-5 py-4">
                                    <div className="text-2xl font-bold text-slate-700">{parsed.duplicadas}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">Duplicadas na planilha (puladas)</div>
                                </div>
                                <div className="flex-1 px-5 py-4">
                                    <div className="text-2xl font-bold text-amber-700">{parsed.semEmpresa}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">Sem empresa (puladas)</div>
                                </div>
                            </div>

                            {loading && (
                                <div className="space-y-2">
                                    <div className="bg-slate-100 rounded-full h-2.5 w-full overflow-hidden">
                                        <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <p className="text-xs text-slate-500 text-center">Importando... {progress}%</p>
                                </div>
                            )}

                            <div className="flex justify-between">
                                <Button variant="ghost" onClick={() => setStep("mapear")} disabled={loading}>Voltar</Button>
                                <Button onClick={importar} disabled={loading || parsed.validas.length === 0}>
                                    {loading ? <Loader2 className="animate-spin" /> : <Upload />}
                                    Importar {parsed.validas.length} lead(s)
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === "concluido" && resultado && (
                        <div className="flex flex-col items-center justify-center text-center py-10">
                            <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Importação concluída!</h3>
                            <p className="text-sm text-slate-500 mt-1 max-w-md">
                                {resultado.importados} lead(s) entraram na fila com status Novo.
                                {resultado.duplicados > 0 && ` ${resultado.duplicados} duplicado(s) pulado(s).`}
                                {resultado.ignorados > 0 && ` ${resultado.ignorados} sem empresa pulado(s).`}
                            </p>
                            <div className="flex items-center gap-2 mt-6">
                                <Button variant="outline" onClick={() => { setStep("upload"); setHeaders([]); setRows([]); setResultado(null); }}>
                                    Importar outra planilha
                                </Button>
                                <Button asChild>
                                    <Link href="/prospeccao"><Sparkles /> Ir pra fila e pesquisar</Link>
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {step === "upload" && (
                    <div className="flex items-start gap-2 text-xs text-slate-500 px-1">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>Só a coluna Empresa é obrigatória. Quanto mais dado (CNPJ e site principalmente), melhor o dossiê que a IA monta.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
