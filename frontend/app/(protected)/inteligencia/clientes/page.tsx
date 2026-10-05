"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw, Users, Lock } from "lucide-react";
import { getAiClientes } from "../actions";
import { calcularVisao, type Periodo } from "../metricas";
import InteligenciaView from "../InteligenciaView";

// Aba Clientes da Inteligencia: so para a equipe do Grupo NG (o servidor recusa
// qualquer outra conta). Visao geral lado a lado + a tela de cada clinica em
// modo leitura, sem precisar entrar na conta dela.

function haQuanto(iso: string | null): string | null {
    if (!iso) return null;
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 60) return `${min} min`;
    if (min < 60 * 24) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} d`;
}

const PERIODOS: [Periodo, string][] = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"]];

export default function InteligenciaClientesPage() {
    const queryClient = useQueryClient();
    const [aba, setAba] = useState<string>("geral");
    const [period, setPeriod] = useState<Periodo>("hoje");

    const q = useQuery({
        queryKey: ["ai", "clientes"],
        queryFn: async () => {
            const r = await getAiClientes();
            if (!r.success) throw new Error(r.error);
            return r.clientes ?? [];
        },
        refetchInterval: 60_000,
    });
    const clientes = q.data ?? [];

    const linhas = useMemo(() => clientes.map((c) => {
        const { overview } = calcularVisao(c.states as any[], period);
        // ultima analise da IA nesta clinica: mostra se o motor esta rodando
        const ultimaAnalise = (c.states as any[])[0]?.updated_at ?? null;
        return { ...c, overview, ultimaAnalise };
    }), [clientes, period]);

    const atualizar = () => {
        if (aba === "geral") q.refetch();
        else queryClient.invalidateQueries({ queryKey: ["ai", "page", aba] });
    };

    if (q.isLoading) {
        return (
            <div className="flex h-full items-center justify-center text-slate-500 gap-2">
                <Loader2 className="animate-spin" size={18} /> Carregando clientes...
            </div>
        );
    }
    if (q.isError) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center max-w-md">
                    <Lock className="mx-auto text-slate-400 mb-3" size={28} />
                    <p className="text-sm text-slate-600">{(q.error as Error)?.message}</p>
                    <a href="/inteligencia" className="inline-block mt-4 text-sm font-semibold text-indigo-600 hover:underline">← Voltar</a>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto bg-slate-50">
            <div className="max-w-7xl mx-auto px-6 pt-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <a href="/inteligencia" title="Voltar para a minha conta" aria-label="Voltar para a minha conta"
                            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
                            <ArrowLeft size={16} />
                        </a>
                        <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                            <Users size={20} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">Inteligência dos clientes</h1>
                            <p className="text-xs text-slate-500">Só a equipe do Grupo NG vê esta página. Tudo em modo leitura.</p>
                        </div>
                    </div>
                    <button onClick={atualizar}
                        className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        title="Atualizar" aria-label="Atualizar dados">
                        <RefreshCw size={15} className={q.isFetching ? "animate-spin" : ""} />
                    </button>
                </div>

                {/* Abas: visao geral + uma por clinica */}
                <div className="flex flex-wrap gap-1 border-b border-slate-200">
                    {[{ id: "geral", nome: "Visão geral" }, ...clientes.map((c) => ({ id: c.id, nome: c.nome }))].map((t) => (
                        <button key={t.id} onClick={() => setAba(t.id)}
                            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                                aba === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                            {t.nome}
                        </button>
                    ))}
                </div>
            </div>

            {aba === "geral" ? (
                <div className="max-w-7xl mx-auto px-6 py-6">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                            {PERIODOS.map(([k, l]) => (
                                <button key={k} onClick={() => setPeriod(k)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                                        period === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                                    {l}
                                </button>
                            ))}
                        </div>
                        <span className="ml-auto text-[11px] text-slate-400">Clique numa clínica para ver tudo dela</span>
                    </div>

                    {linhas.length === 0 ? (
                        <p className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
                            Nenhuma clínica com a IA ligada.
                        </p>
                    ) : (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
                                        <th className="text-left font-bold px-4 py-3">Clínica</th>
                                        <th className="text-right font-bold px-3 py-3">Conversas</th>
                                        <th className="text-right font-bold px-3 py-3">Leads novos</th>
                                        <th className="text-right font-bold px-3 py-3">Alta intenção</th>
                                        <th className="text-right font-bold px-3 py-3">Aguardando clínica</th>
                                        <th className="text-right font-bold px-3 py-3">Agendamentos</th>
                                        <th className="text-right font-bold px-3 py-3">Perdas sugeridas</th>
                                        <th className="text-right font-bold px-4 py-3">Última análise</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {linhas.map((c) => {
                                        const o = c.overview;
                                        const espera = haQuanto(o.esperaMaisAntiga);
                                        const analise = haQuanto(c.ultimaAnalise);
                                        return (
                                            <tr key={c.id} onClick={() => setAba(c.id)} className="cursor-pointer hover:bg-slate-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-slate-800">{c.nome}</div>
                                                    <div className="text-[11px] text-slate-400">
                                                        {c.mode === "pilot" ? "Piloto" : "Observador"} · motor {c.motor === "hermes" ? "Hermes" : "GPT"}
                                                    </div>
                                                </td>
                                                <td className="text-right px-3 py-3 font-semibold text-slate-700">{o.analisadas}</td>
                                                <td className="text-right px-3 py-3 font-semibold text-sky-700">{o.leadsNovos}</td>
                                                <td className="text-right px-3 py-3 font-semibold text-amber-700">{o.altaIntencao}</td>
                                                <td className="text-right px-3 py-3">
                                                    <span className={`font-semibold ${o.aguardandoClinica ? "text-rose-600" : "text-slate-400"}`}>{o.aguardandoClinica}</span>
                                                    {espera && <div className="text-[10px] text-rose-500">mais antiga há {espera}</div>}
                                                </td>
                                                <td className="text-right px-3 py-3 font-semibold text-emerald-700">{o.agendamentos}</td>
                                                <td className="text-right px-3 py-3 font-semibold text-rose-500">{o.perdasSugeridas}</td>
                                                <td className="text-right px-4 py-3 text-xs text-slate-500">{analise ? `há ${analise}` : "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-2">
                        Conversas pela última mensagem; leads novos pela data do 1º contato; agendamentos pela data em que o paciente confirmou.
                    </p>
                </div>
            ) : (
                <InteligenciaView key={aba} tenantId={aba} readOnly />
            )}
        </div>
    );
}
