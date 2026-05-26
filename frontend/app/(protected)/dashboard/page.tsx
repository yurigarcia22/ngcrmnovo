import { Suspense } from "react";
import { getDashboardData, getSellersPerformance } from "@/app/(protected)/dashboard/actions";
import { getTeamMembers } from "@/app/actions";
import { getCompanyDetails } from "@/app/(protected)/settings/company/actions";
import { getOnboardingState } from "@/app/(protected)/dashboard/onboarding";
import { getTenantContext } from "@/lib/tenant-context";
import { DashboardHeader, DashboardFilterBar } from "./components/header";
import { MessagesCard } from "./components/cards";
import { WonLeadsWidget } from "./components/WonLeadsWidget";
import { KpiCard } from "./components/KpiCard";
import { ConversionFunnel } from "./components/ConversionFunnel";
import { TopSellers } from "./components/TopSellers";
import { SellersPerformanceTable } from "./components/SellersPerformanceTable";
import { ResponseQualityCard } from "./components/ResponseQualityCard";
import OnboardingBanner from "@/components/dashboard/OnboardingBanner";
import {
    Trophy, Wallet, Target, Coins, Clock, CheckSquare,
    Phone, PhoneCall, Users, UserCheck, CalendarCheck,
} from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function formatCurrency(v: number): string {
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCurrencyCompact(v: number): string {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 10_000) return `R$ ${(v / 1000).toFixed(0)}k`;
    if (v >= 1_000) return `R$ ${(v / 1000).toFixed(1)}k`;
    return formatCurrency(v);
}

export default async function DashboardPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const period = (searchParams.period as string) || "today";
    const userId = (searchParams.userId as string) || "all";
    const startDate = searchParams.startDate as string | undefined;
    const endDate = searchParams.endDate as string | undefined;

    const [companyFetch, onboarding, ctx] = await Promise.all([
        getCompanyDetails(),
        getOnboardingState(),
        getTenantContext(),
    ]);
    const companyName = companyFetch.success ? companyFetch.name : "CRM";
    const modules = ctx?.modules ?? null;

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] p-6 lg:p-8 font-sans">
            <div className="relative z-10 max-w-[1600px] mx-auto">
                <DashboardHeader />

                {onboarding.needsOnboarding && (
                    <OnboardingBanner steps={onboarding.steps} />
                )}

                <div className="mb-8 mt-4">
                    <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">{companyName}</h1>
                    <p className="text-blue-200/60 text-sm mt-1">Visão Geral de Performance</p>
                    <div className="mt-5">
                        <Suspense fallback={<div className="h-10 bg-white/10 rounded-full w-64 animate-pulse" />}>
                            <FilterWrapper period={period} userId={userId} startDate={startDate} endDate={endDate} />
                        </Suspense>
                    </div>
                </div>

                <Suspense fallback={<DashboardSkeleton />}>
                    <DashboardContent
                        period={period}
                        userId={userId}
                        startDate={startDate}
                        endDate={endDate}
                        modules={modules}
                    />
                </Suspense>
            </div>
        </div>
    );
}

async function FilterWrapper({ period, userId, startDate, endDate }: { period: string; userId: string; startDate?: string; endDate?: string }) {
    const { data: users } = await getTeamMembers();
    return (
        <DashboardFilterBar
            currentPeriod={period}
            currentUserId={userId}
            users={users || []}
            currentStartDate={startDate}
            currentEndDate={endDate}
        />
    );
}

async function DashboardContent({
    period, userId, startDate, endDate, modules,
}: {
    period: string; userId: string; startDate?: string; endDate?: string;
    modules: Record<string, boolean> | null;
}) {
    const [data, perfRes] = await Promise.all([
        getDashboardData({ period, userId, startDate, endDate }),
        getSellersPerformance({ period, startDate, endDate }),
    ]);
    const perfData = perfRes.success ? perfRes.data : null;
    const sellers = perfData?.sellers ?? [];
    const quality = perfData?.quality ?? null;

    const showColdCall = modules?.cold_call === true && (data.coldMetrics?.total ?? 0) > 0;
    const topSellersData = sellers
        .filter((s: any) => s.wonValue > 0)
        .slice(0, 5)
        .map((s: any) => ({ name: s.name, count: s.wonCount, value: s.wonValue }));
    const showTopSellers = userId === "all" && topSellersData.length > 0;
    const showSellersTable = userId === "all" && sellers.length > 1;

    return (
        <div className="space-y-6">

            {/* === HERO ROW: 4 KPIs PRINCIPAIS === */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    icon={Trophy}
                    label="Receita ganha"
                    value={formatCurrencyCompact(data.wonValue)}
                    sub={`${data.wonDeals} ${data.wonDeals === 1 ? "deal" : "deals"}`}
                    changePct={data.wonValueChangePct}
                    changeLabel=""
                    accent="emerald"
                />
                <KpiCard
                    icon={Wallet}
                    label="Pipeline aberto"
                    value={formatCurrencyCompact(data.totalOpenValue)}
                    sub={`${data.totalLeads} ${data.totalLeads === 1 ? "lead" : "leads"}`}
                    accent="indigo"
                />
                <KpiCard
                    icon={Target}
                    label="Conversão"
                    value={`${data.conversionRate}%`}
                    sub={`${data.wonDeals} ganhos · ${data.lostDeals} perdidos`}
                    accent="blue"
                />
                <KpiCard
                    icon={Coins}
                    label="Ticket médio"
                    value={data.avgTicket > 0 ? formatCurrencyCompact(data.avgTicket) : "—"}
                    sub="por deal fechado"
                    accent="purple"
                />
            </div>

            {/* === QUALIDADE DO ATENDIMENTO (somatorio do tenant) === */}
            {quality && (
                <ResponseQualityCard quality={quality} />
            )}

            {/* === PERFORMANCE POR VENDEDOR (so quando filtro = todos) === */}
            {showSellersTable && (
                <SellersPerformanceTable sellers={sellers} />
            )}

            {/* === SECOND ROW: MENSAGENS + FUNIL === */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5">
                    <MessagesCard
                        conversationsCount={data.conversationsCount}
                        unansweredCount={data.unansweredChatsCount}
                    />
                </div>
                <div className="lg:col-span-7">
                    <ConversionFunnel data={data.leadsByStage} />
                </div>
            </div>

            {/* === THIRD ROW: ATIVIDADE + WON DETAIL + TOP SELLERS === */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-3">
                    <KpiCard
                        icon={CheckSquare}
                        label="Tarefas pendentes"
                        value={String(data.tasksCount)}
                        sub="acompanhar"
                        accent="amber"
                    />
                </div>
                <div className="lg:col-span-3">
                    <KpiCard
                        icon={Clock}
                        label="Maior espera"
                        value={data.longestWaitTime}
                        sub="fila de atendimento"
                        accent="rose"
                    />
                </div>

                {showTopSellers ? (
                    <div className="lg:col-span-6">
                        <TopSellers sellers={topSellersData} />
                    </div>
                ) : (
                    <div className="lg:col-span-6">
                        <WonLeadsWidget
                            wonDealsCount={data.wonDeals}
                            formattedWonValue={formatCurrency(data.wonValue)}
                            period={period}
                            userId={userId}
                            startDate={startDate}
                            endDate={endDate}
                        />
                    </div>
                )}
            </div>

            {/* === COLD CALL (so se modulo ativo + tem dados) === */}
            {showColdCall && (
                <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-1 h-6 bg-indigo-400 rounded-full" />
                        <h2 className="text-base font-bold text-white tracking-wide uppercase">
                            Prospecção (Cold Call)
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        <ColdCard
                            icon={Users}
                            label="Importados"
                            value={data.coldMetrics?.total ?? 0}
                            color="text-white"
                        />
                        <ColdCard
                            icon={Phone}
                            label="Ligações"
                            value={data.coldMetrics?.calls ?? 0}
                            color="text-yellow-300"
                            pct={data.coldMetrics?.total ? Math.round((data.coldMetrics.calls / data.coldMetrics.total) * 100) : 0}
                        />
                        <ColdCard
                            icon={PhoneCall}
                            label="Conexões"
                            value={data.coldMetrics?.connections ?? 0}
                            color="text-orange-300"
                            pct={data.coldMetrics?.calls ? Math.round((data.coldMetrics.connections / data.coldMetrics.calls) * 100) : 0}
                        />
                        <ColdCard
                            icon={UserCheck}
                            label="Com decisor"
                            value={data.coldMetrics?.decisionMakers ?? 0}
                            color="text-cyan-300"
                            pct={data.coldMetrics?.connections ? Math.round(((data.coldMetrics.decisionMakers || 0) / data.coldMetrics.connections) * 100) : 0}
                        />
                        <ColdCard
                            icon={CalendarCheck}
                            label="Reuniões"
                            value={data.coldMetrics?.meetings ?? 0}
                            color="text-emerald-300"
                            pct={data.coldMetrics?.decisionMakers ? Math.round((data.coldMetrics.meetings / data.coldMetrics.decisionMakers) * 100) : 0}
                        />
                    </div>
                </div>
            )}

        </div>
    );
}

function ColdCard({
    icon: Icon, label, value, color, pct,
}: {
    icon: typeof Users; label: string; value: number; color: string; pct?: number;
}) {
    return (
        <div className="bg-[#0f172a]/40 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors relative">
            {typeof pct === "number" && (
                <div className="absolute top-2 right-2 text-[9px] font-bold text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                    {pct}%
                </div>
            )}
            <Icon className="w-4 h-4 text-gray-500 mb-2" />
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                {label}
            </div>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-white/[0.05] rounded-2xl border border-white/10" />
            ))}
            <div className="lg:col-span-5 h-64 bg-white/[0.05] rounded-2xl border border-white/10" />
            <div className="lg:col-span-7 h-64 bg-white/[0.05] rounded-2xl border border-white/10" />
        </div>
    );
}
