import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/simple-ui";
import { Card } from "@/components/ui/card";
import { Plus, Megaphone, Calendar, Users, Target } from "lucide-react";
import { listCampaigns } from "@/app/actions-webinar";
import {
  WEBINAR_STATUS_LABELS,
  type WebinarCampaign,
  type WebinarStatus,
} from "@/types/webinar";

const STATUS_COLORS: Record<WebinarStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  scraping: "bg-amber-100 text-amber-700",
  enriching: "bg-blue-100 text-blue-700",
  ready: "bg-emerald-100 text-emerald-700",
  active: "bg-indigo-100 text-indigo-700",
  finished: "bg-slate-100 text-slate-500",
  archived: "bg-slate-50 text-slate-400",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Sem data";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function CampaignCard({ campaign }: { campaign: WebinarCampaign }) {
  const conversion =
    campaign.total_invited > 0
      ? Math.round((campaign.total_converted / campaign.total_invited) * 100)
      : 0;

  return (
    <Link href={`/webinar/${campaign.id}`}>
      <Card className="p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 truncate">{campaign.name}</h3>
            {campaign.theme && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{campaign.theme}</p>
            )}
          </div>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
              STATUS_COLORS[campaign.status]
            }`}
          >
            {WEBINAR_STATUS_LABELS[campaign.status]}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
          <Calendar className="w-3.5 h-3.5" />
          <span>{formatDate(campaign.event_date)}</span>
          {campaign.target_nicho && (
            <>
              <span className="text-slate-300">•</span>
              <Target className="w-3.5 h-3.5" />
              <span className="truncate">{campaign.target_nicho}</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100">
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Leads</div>
            <div className="text-sm font-bold text-slate-700">{campaign.total_leads}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Convidados</div>
            <div className="text-sm font-bold text-slate-700">{campaign.total_invited}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Confirmados</div>
            <div className="text-sm font-bold text-slate-700">{campaign.total_confirmed}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Conv %</div>
            <div className="text-sm font-bold text-emerald-600">{conversion}%</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

async function CampaignsList() {
  const result = await listCampaigns();

  if (!result.success) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p className="text-sm">Erro ao carregar campanhas: {result.error}</p>
      </div>
    );
  }

  const campaigns = result.data ?? [];

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 mb-4">
          <Megaphone className="w-8 h-8 text-indigo-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">
          Nenhuma campanha de webinar ainda
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
          Cria a primeira campanha pra prospectar empresas, enviar convites, gerenciar
          cadencia automatica e visualizar o funil em tempo real.
        </p>
        <Link href="/webinar/new">
          <Button className="bg-slate-900 text-white hover:bg-slate-800">
            <Plus className="mr-2 h-4 w-4" />
            Criar primeira campanha
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} />
      ))}
    </div>
  );
}

export default function WebinarPage() {
  return (
    <div className="p-6 space-y-6 bg-white min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webinar</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Campanhas de prospeccao automatizada com cadencia e funil em tempo real.
          </p>
        </div>
        <Link href="/webinar/new">
          <Button className="bg-slate-900 text-white hover:bg-slate-800">
            <Plus className="mr-2 h-4 w-4" />
            Nova campanha
          </Button>
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="text-center py-16 text-slate-400 text-sm">
            Carregando campanhas...
          </div>
        }
      >
        <CampaignsList />
      </Suspense>
    </div>
  );
}
