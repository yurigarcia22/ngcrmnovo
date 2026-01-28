import { Suspense } from "react";
import { getDashboardData } from "@/app/(protected)/dashboard/actions";
import { getTeamMembers } from "@/app/actions";
import { DashboardHeader, DashboardFilterBar } from "./components/header";
import { StatCard, MessagesCard } from "./components/cards";
import { DealsStageChart } from "./components/radial-chart";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function DashboardPage(props: {
  searchParams: SearchParams
}) {
  const searchParams = await props.searchParams;
  const period = searchParams.period as string || "today";
  const userId = searchParams.userId as string || "all";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#020617] p-8 font-sans">

      <div className="relative z-10">
        {/* 1. Header & Filters */}
        <DashboardHeader />

        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">GRUPO NG</h1>
          <p className="text-blue-200/60 font-medium">Visão Geral de Performance</p>
          <div className="mt-6 flex justify-center">
            <Suspense fallback={<div className="h-10 bg-white/10 rounded-full w-64 animate-pulse" />}>
              <FilterWrapper period={period} userId={userId} />
            </Suspense>
          </div>
        </div>

        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent period={period} userId={userId} />
        </Suspense>
      </div>
    </div>
  );
}

async function FilterWrapper({ period, userId }: { period: string, userId: string }) {
  const { data: users } = await getTeamMembers();
  return (
    <DashboardFilterBar
      currentPeriod={period}
      currentUserId={userId}
      users={users || []}
    />
  )
}

async function DashboardContent({ period, userId }: { period: string, userId: string }) {
  const data = await getDashboardData({ period, userId });

  const formattedPipeline = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(data.totalOpenValue);

  const formattedWonValue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(data.wonValue);

  const getSubtext = () => {
    if (period === 'today') return 'hoje';
    if (period === 'yesterday') return 'ontem';
    if (period === 'week') return 'esta semana';
    if (period === 'month') return 'este mês';
    return 'período selecionado';
  }
  const subtext = getSubtext();

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 max-w-[1600px] mx-auto">

      {/* --- ROW 1: KEY METRICS --- */}

      {/* 1. Mensagens (Large) */}
      <div className="md:col-span-12 lg:col-span-4 h-full">
        <MessagesCard
          conversationsCount={data.conversationsCount}
          unansweredCount={data.unansweredChatsCount}
        />
      </div>

      {/* 2. Leads Ativos (Pipeline) */}
      <div className="md:col-span-6 lg:col-span-2">
        <StatCard title="LEADS ATIVOS" value={data.totalLeads} trend="neutral" trendValue="Pipeline">
          <div className="mt-4">
            <div className="text-4xl font-bold text-white">{data.totalLeads}</div>
            <p className="text-sm font-medium text-pink-400 mt-1">{formattedPipeline}</p>
          </div>
        </StatCard>
      </div>

      {/* 3. Leads Ganhos */}
      <div className="md:col-span-6 lg:col-span-2">
        <StatCard title="LEADS GANHOS" value={data.wonDeals} trend="up" trendValue="Vendas">
          <div className="mt-4">
            <div className="text-4xl font-bold text-white">{data.wonDeals}</div>
            <p className="text-lg font-medium text-emerald-400 mt-1">{formattedWonValue}</p>
          </div>
        </StatCard>
      </div>

      {/* 4. Chart (Distribuição) */}
      <div className="md:col-span-12 lg:col-span-4 row-span-2">
        <DealsStageChart data={data.leadsByStage} />
      </div>


      {/* --- ROW 2: SECONDARY & COLD CALL --- */}

      {/* Tarefas */}
      <div className="md:col-span-6 lg:col-span-2">
        <StatCard title="TAREFAS PENDENTES" value={data.tasksCount} subtitle="Total pendente" className="h-full">
          <div className="mt-4">
            <div className="text-4xl font-bold text-indigo-400">{data.tasksCount}</div>
          </div>
        </StatCard>
      </div>

      {/* Tempo Espera */}
      <div className="md:col-span-6 lg:col-span-2">
        <StatCard title="MAIOR ESPERA" value={data.longestWaitTime} subtitle="Fila de atendimento" className="h-full">
          <div className="mt-4">
            <div className="text-3xl font-bold text-amber-400">{data.longestWaitTime}</div>
          </div>
        </StatCard>
      </div>

      {/* Conversas Totais (Small Stat) */}
      <div className="md:col-span-6 lg:col-span-2">
        <StatCard title="CONVERSAS TOTAIS" value={data.conversationsCount} subtitle={subtext} className="h-full">
          <div className="mt-4">
            <div className="text-4xl font-bold text-blue-400">{data.conversationsCount}</div>
          </div>
        </StatCard>
      </div>

      <div className="md:col-span-6 lg:col-span-2">
        {/* Spacer or another small stat if needed */}
      </div>


      {/* --- ROW 3: COLD CALL SECTION (Full Width) --- */}
      <div className="col-span-12 mt-4">
        <div className="bg-[#1e1b4b]/50 rounded-3xl p-8 border border-indigo-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-3xl rounded-full -mr-20 -mt-20 pointer-events-none"></div>

          <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="h-8 w-1 bg-indigo-500 rounded-full"></div>
            <h2 className="text-xl font-bold text-white tracking-wide">MÉTRICAS DE PROSPECÇÃO (COLD CALL)</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
            {/* Total Leads */}
            <div className="bg-[#0f172a]/40 p-5 rounded-2xl border border-white/5 hover:bg-[#0f172a]/60 transition-colors relative group">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">LEADS IMPORTADOS</h3>
              <div className="text-2xl font-bold text-white">{data.coldMetrics?.total || 0}</div>
              <p className="text-[10px] text-gray-500 mt-2">{subtext}</p>
            </div>

            {/* Ligações */}
            <div className="bg-[#0f172a]/40 p-5 rounded-2xl border border-white/5 hover:bg-[#0f172a]/60 transition-colors relative group">
              <div className="absolute top-2 right-2 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full group-hover:bg-emerald-400/20 transition-colors">
                {data.coldMetrics?.total ? Math.round(((data.coldMetrics.calls) / data.coldMetrics.total) * 100) : 0}%
              </div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">LIGAÇÕES FEITAS</h3>
              <div className="text-2xl font-bold text-yellow-400">{data.coldMetrics?.calls || 0}</div>
              <p className="text-[10px] text-gray-500 mt-1">
                de leads
              </p>
            </div>

            {/* Conexões */}
            <div className="bg-[#0f172a]/40 p-5 rounded-2xl border border-white/5 hover:bg-[#0f172a]/60 transition-colors relative group">
              <div className="absolute top-2 right-2 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full group-hover:bg-emerald-400/20 transition-colors">
                {data.coldMetrics?.calls ? Math.round(((data.coldMetrics.connections) / data.coldMetrics.calls) * 100) : 0}%
              </div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">CONEXÕES</h3>
              <div className="text-2xl font-bold text-orange-400">{data.coldMetrics?.connections || 0}</div>
              <p className="text-[10px] text-gray-500 mt-1">
                de ligações
              </p>
            </div>

            {/* Conexão com Decisor */}
            <div className="bg-[#0f172a]/40 p-5 rounded-2xl border border-white/5 hover:bg-[#0f172a]/60 transition-colors relative group">
              <div className="absolute top-2 right-2 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full group-hover:bg-emerald-400/20 transition-colors">
                {data.coldMetrics?.connections ? Math.round(((data.coldMetrics.decisionMakers || 0) / data.coldMetrics.connections) * 100) : 0}%
              </div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">CONEXÃO COM O DECISOR</h3>
              <div className="text-2xl font-bold text-cyan-400">{data.coldMetrics?.decisionMakers || 0}</div>
              <p className="text-[10px] text-gray-500 mt-1">
                de conexões
              </p>
            </div>

            {/* Reuniões */}
            <div className="bg-[#0f172a]/40 p-5 rounded-2xl border border-white/5 hover:bg-[#0f172a]/60 transition-colors relative group">
              <div className="absolute top-2 right-2 text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full group-hover:bg-emerald-400/20 transition-colors">
                {data.coldMetrics?.decisionMakers ? Math.round(((data.coldMetrics.meetings) / data.coldMetrics.decisionMakers) * 100) : 0}%
              </div>
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">REUNIÕES</h3>
              <div className="text-2xl font-bold text-emerald-400">{data.coldMetrics?.meetings || 0}</div>
              <p className="text-[10px] text-gray-500 mt-1">
                de decisores
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
      <div className="lg:col-span-2 h-64 bg-white/10 rounded-xl"></div>
      <div className="h-64 bg-white/10 rounded-xl"></div>
      <div className="h-64 bg-white/10 rounded-xl"></div>
    </div>
  )
}