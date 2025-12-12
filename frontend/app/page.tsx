import { Suspense } from "react";
import { getDashboardData } from "./dashboard/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, TrendingUp, Briefcase } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const data = await getDashboardData();

  const formattedValue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(data.totalOpenValue);

  return (
    <div className="space-y-4">
      {/* 1. Top Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Hoje</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalLeadsToday}</div>
            <p className="text-xs text-muted-foreground">
              Novos leads criados hoje
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vendas no Mês</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.wonDealsMonth}</div>
            <p className="text-xs text-muted-foreground">
              Deals ganhos neste mês
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor em Pipeline</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formattedValue}</div>
            <p className="text-xs text-muted-foreground">
              Soma de leads abertos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Middle Chart & Bottom Table Layout */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">

        {/* Chart Section - Takes up 4 columns on large screens */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Leads por Estágio</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <LeadsChart data={data.leadsByStage} />
          </CardContent>
        </Card>

        {/* Table Section - Takes up 3 columns on large screens */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Últimos Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentLeadsTable leads={data.lastLeads} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Separate Client Component for Recharts to avoid hydration issues if needed, 
// strictly speaking Recharts works in SC if just rendering SVG but often better as client component.
// Actually, let's keep it here but I'll make a helper component.
// Recharts needs to run on client because it uses window/DOM APIs for layout often.
// So I will make a client component wrapper for the chart.

function LeadsChart({ data }: { data: any[] }) {
  // Client-side wrapper
  return (
    <div className="h-[300px] w-full">
      <ChartWrapper data={data} />
    </div>
  )
}

function RecentLeadsTable({ leads }: { leads: any[] }) {
  if (!leads || leads.length === 0) {
    return <div className="text-sm text-muted-foreground">Nenhum lead recente.</div>;
  }
  return (
    <div className="space-y-4">
      {leads.map((lead) => (
        <div key={lead.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
          <div className="space-y-1">
            <p className="text-sm font-medium leading-none truncate max-w-[150px]">{lead.title}</p>
            <p className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</p>
          </div>
          <div className="font-medium">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(lead.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <div className="col-span-4 h-[400px] rounded-xl bg-muted/50 animate-pulse" />
        <div className="col-span-3 h-[400px] rounded-xl bg-muted/50 animate-pulse" />
      </div>
    </div>
  )
}

// We need a client component for the Chart to handle Recharts usage
import { ChartWrapper } from "./dashboard/chart-wrapper";