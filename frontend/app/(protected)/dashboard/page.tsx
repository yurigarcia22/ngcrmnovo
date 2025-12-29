import { Suspense } from "react";
import { getDashboardData } from "@/app/(protected)/dashboard/actions";
import { getTeamMembers } from "@/app/actions";
import { DashboardHeader, DashboardFilterBar } from "./components/header";
import { StatCard, MessagesCard } from "./components/cards";
import { SourcesRadialChart } from "./components/radial-chart";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function DashboardPage(props: {
  searchParams: SearchParams
}) {
  const searchParams = await props.searchParams;
  const period = searchParams.period as string || "today";
  const userId = searchParams.userId as string || "all";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0284c7] via-[#0369a1] to-[#0c4a6e] p-8 font-sans">

      {/* 1. Header & Filters */}
      <DashboardHeader />

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-white mb-6">GRUPO NG</h1>
        <Suspense fallback={<div className="h-12 bg-white/10 rounded-full w-full max-w-2xl mx-auto animate-pulse" />}>
          <FilterWrapper period={period} userId={userId} />
        </Suspense>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent period={period} userId={userId} />
      </Suspense>
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

      {/* Row 1 */}
      {/* Mensagens Recebidas (Large, spans 2 cols on LG) */}
      <div className="lg:col-span-2 md:col-span-2">
        <MessagesCard />
      </div>

      {/* Conversas Atuais */}
      <StatCard title="CONVERSAS ATUAIS" value={data.conversationsCount}>
        <div className="mt-4">
          <div className="text-5xl font-bold text-[#6366f1]">{data.conversationsCount}</div>
          <div className="w-16 h-1 bg-gray-700 mt-4 rounded-full"></div>
          <p className="text-xs text-gray-400 mt-4">{subtext}</p>
        </div>
      </StatCard>

      {/* Chats Sem Respostas */}
      <StatCard title="CHATS SEM RESPOSTAS" value={data.unansweredChatsCount}>
        <div className="mt-4">
          <div className="text-5xl font-bold text-[#6366f1]">{data.unansweredChatsCount}</div>
          <div className="w-16 h-1 bg-gray-700 mt-4 rounded-full"></div>
          <p className="text-xs text-gray-400 mt-4">{subtext}</p>
        </div>
      </StatCard>

      {/* Row 2 */}

      {/* Leads Ganhos */}
      <StatCard title="LEADS GANHOS" value={data.wonDeals}>
        <div className="mt-4">
          <div className="text-5xl font-bold text-[#a855f7]">{data.wonDeals}</div>
          <p className="text-sm font-bold text-white mt-1">{formattedWonValue}</p>
          <div className="w-full h-px bg-gray-700 my-4"></div>
          <p className="text-xs text-gray-400">{subtext}</p>
        </div>
      </StatCard>

      {/* Leads Ativos (Pipeline) */}
      <StatCard title="LEADS ATIVOS" value={data.totalLeads}>
        <div className="mt-4">
          <div className="text-5xl font-bold text-[#ec4899]">{data.totalLeads}</div>
          <p className="text-sm font-bold text-white mt-1">{formattedPipeline}</p>
          <div className="w-full h-px bg-gray-700 my-4"></div>
          <p className="text-xs text-gray-400">{subtext}</p>
        </div>
      </StatCard>

      {/* Tarefas */}
      <StatCard title="TAREFAS PENDENTES" value={data.tasksCount}>
        <div className="mt-4">
          <div className="text-5xl font-bold text-[#6366f1]">{data.tasksCount}</div>
          <div className="w-full h-px bg-gray-700 my-4"></div>
          <p className="text-xs text-gray-400">Total pendente</p>
        </div>
      </StatCard>

      {/* Fontes de Lead (Visual Pie/Radial) */}
      <div className="lg:col-span-2 md:col-span-2 min-h-[300px]">
        <SourcesRadialChart />
      </div>

      {/* Tempo de Resposta */}
      <StatCard title="TEMPO DE RESPOSTA" value="--">
        <div className="mt-4">
          <div className="text-5xl font-bold text-[#10b981]">--</div>
          <p className="text-xs text-gray-400 mt-1">N/A</p>
        </div>
      </StatCard>

      {/* Mais Tempo Esperando */}
      <StatCard title="MAIS TEMPO ESPERANDO" value={data.longestWaitTime}>
        <div className="mt-4">
          <div className="text-3xl font-bold text-[#6366f1]">{data.longestWaitTime}</div>
          <div className="w-full h-px bg-gray-700 my-4"></div>
          <p className="text-xs text-yellow-500">Atenção requerida</p>
        </div>
      </StatCard>

      {/* --- COLD CALL SECTION --- */}
      <div className="lg:col-span-4 md:col-span-2 mt-8 mb-4 border-t border-white/10 pt-4">
        <h2 className="text-xl font-bold text-white mb-4">Métricas Cold Call</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Total Cold Leads */}
          <div className="bg-[#1e1b4b] rounded-2xl p-6 border border-white/5 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-bold text-gray-400 tracking-wider uppercase">LEADS TOTAIS</h3>
            </div>
            <div className="mt-4">
              <div className="text-4xl font-bold text-blue-400">{data.coldMetrics?.total || 0}</div>
              <p className="text-xs text-gray-400 mt-2">{subtext}</p>
            </div>
          </div>

          {/* Ligações Feitas */}
          <div className="bg-[#1e1b4b] rounded-2xl p-6 border border-white/5 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-bold text-gray-400 tracking-wider uppercase">LIGAÇÕES FEITAS</h3>
            </div>
            <div className="mt-4">
              <div className="text-4xl font-bold text-yellow-400">{data.coldMetrics?.calls || 0}</div>
              <p className="text-xs text-gray-400 mt-2">Tentativas Totais</p>
            </div>
          </div>

          {/* Conexões */}
          <div className="bg-[#1e1b4b] rounded-2xl p-6 border border-white/5 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-bold text-gray-400 tracking-wider uppercase">CONEXÕES</h3>
            </div>
            <div className="mt-4">
              <div className="text-4xl font-bold text-orange-400">{data.coldMetrics?.connections || 0}</div>
              <p className="text-xs text-gray-400 mt-2">Atendidas</p>
            </div>
          </div>

          {/* Reuniões */}
          <div className="bg-[#1e1b4b] rounded-2xl p-6 border border-white/5 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-bold text-gray-400 tracking-wider uppercase">REUNIÕES</h3>
            </div>
            <div className="mt-4">
              <div className="text-4xl font-bold text-green-400">{data.coldMetrics?.meetings || 0}</div>
              <p className="text-xs text-gray-400 mt-2">Agendadas</p>
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