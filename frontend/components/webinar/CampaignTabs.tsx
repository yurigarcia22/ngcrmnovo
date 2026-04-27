"use client";

import { useState } from "react";
import { Settings2, Users, CheckCircle2, Calendar, BarChart3 } from "lucide-react";
import type { WebinarCampaign } from "@/types/webinar";
import { SetupTab } from "./tabs/SetupTab";
import { LeadsTab } from "./tabs/LeadsTab";
import { ConfirmedTab } from "./tabs/ConfirmedTab";
import { CadenceTab } from "./tabs/CadenceTab";
import { FunnelTab } from "./tabs/FunnelTab";

type TabKey = "setup" | "leads" | "confirmed" | "cadence" | "funnel";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "setup", label: "Setup", icon: Settings2 },
  { key: "leads", label: "Leads", icon: Users },
  { key: "confirmed", label: "Confirmados", icon: CheckCircle2 },
  { key: "cadence", label: "Cadência", icon: Calendar },
  { key: "funnel", label: "Funil", icon: BarChart3 },
];

export function CampaignTabs({ campaign }: { campaign: WebinarCampaign }) {
  const [active, setActive] = useState<TabKey>("setup");

  return (
    <div>
      <div className="px-6 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6">
        {active === "setup" && <SetupTab campaign={campaign} />}
        {active === "leads" && <LeadsTab campaign={campaign} />}
        {active === "confirmed" && <ConfirmedTab campaign={campaign} />}
        {active === "cadence" && <CadenceTab campaign={campaign} />}
        {active === "funnel" && <FunnelTab campaign={campaign} />}
      </div>
    </div>
  );
}
