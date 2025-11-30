import { createClient } from "@supabase/supabase-js";
import {
  Users,
  DollarSign,
  TrendingUp,
  MessageCircle
} from "lucide-react";
import KPICard from "@/components/dashboard/KPICard";
import FunnelChart from "@/components/dashboard/FunnelChart";
import RecentLeads from "@/components/dashboard/RecentLeads";

// Revalidate every 60 seconds
export const revalidate = 60;

export default async function Dashboard() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // 1. Fetch Data
  const { data: deals } = await supabase
    .from("deals")
    .select("*, contacts(name), stages(name, color)")
    .order("updated_at", { ascending: false });

  const { data: stages } = await supabase
    .from("stages")
    .select("*")
    .order("position");

  // 2. Calculate Metrics
  const totalLeads = deals?.length || 0;

  const totalValue = deals?.reduce((acc, deal) => acc + (deal.value || 0), 0) || 0;

  // Mocked for now as we don't have historical data for trends
  const conversionRate = 18.2;
  const messagesSent = 1432;

  // 3. Prepare Chart Data
  const funnelData = stages?.map(stage => {
    const count = deals?.filter(d => d.stage_id === stage.id).length || 0;
    return {
      name: stage.name,
      value: count,
      color: stage.color || "#cbd5e1"
    };
  }) || [];

  // 4. Prepare Recent Leads
  const recentLeads = deals?.slice(0, 5).map(deal => ({
    id: deal.id,
    title: deal.title,
    value: deal.value || 0,
    contactName: deal.contacts?.name || "Desconhecido",
    stageName: deal.stages?.name || "Etapa",
    updatedAt: deal.updated_at
  })) || [];

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <span className="text-sm text-gray-500">Última atualização: {new Date().toLocaleTimeString('pt-BR')}</span>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Total Leads"
          value={totalLeads}
          icon={Users}
          trend="+12% vs mês passado"
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <KPICard
          title="Pipeline Total"
          value={`R$ ${totalValue.toLocaleString('pt-BR', { notation: "compact" })}`}
          icon={DollarSign}
          trend="+5% vs ontem"
          trendColor="text-green-500"
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <KPICard
          title="Taxa de Conversão"
          value={`${conversionRate}%`}
          icon={TrendingUp}
          trend="-2% vs mês passado"
          trendColor="text-red-500"
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
        <KPICard
          title="Mensagens"
          value={messagesSent}
          icon={MessageCircle}
          trend="+24% vs semana passada"
          iconColor="text-orange-600"
          iconBg="bg-orange-50"
        />
      </div>

      {/* Charts & Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FunnelChart data={funnelData} />
        </div>
        <div className="lg:col-span-1">
          <RecentLeads leads={recentLeads} />
        </div>
      </div>
    </div>
  );
}