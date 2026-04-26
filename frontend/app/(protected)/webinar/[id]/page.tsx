import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCampaign } from "@/app/actions-webinar";
import { WEBINAR_STATUS_LABELS } from "@/types/webinar";
import { CampaignTabs } from "@/components/webinar/CampaignTabs";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scraping: "bg-amber-100 text-amber-700",
  enriching: "bg-blue-100 text-blue-700",
  ready: "bg-emerald-100 text-emerald-700",
  active: "bg-indigo-100 text-indigo-700",
  finished: "bg-slate-100 text-slate-500",
  archived: "bg-slate-50 text-slate-400",
};

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getCampaign(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const campaign = result.data;

  return (
    <div className="bg-white min-h-screen">
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <Link
          href="/webinar"
          className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-sm mb-3 w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para campanhas
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold tracking-tight truncate">
                {campaign.name}
              </h1>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                  STATUS_COLORS[campaign.status] ?? STATUS_COLORS.draft
                }`}
              >
                {WEBINAR_STATUS_LABELS[campaign.status]}
              </span>
            </div>
            {campaign.theme && (
              <p className="text-sm text-slate-600">{campaign.theme}</p>
            )}
          </div>
        </div>
      </div>

      <CampaignTabs campaign={campaign} />
    </div>
  );
}
