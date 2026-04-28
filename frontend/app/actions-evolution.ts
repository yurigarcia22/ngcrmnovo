"use server";

import {
  listEvolutionInstances,
  setEvolutionWebhook,
} from "@/lib/webinar/evolution";

export async function listAvailableInstances(): Promise<{
  success: boolean;
  data?: Array<{
    name: string;
    connectionStatus: string;
    profileName: string | null;
    ownerJid: string | null;
  }>;
  error?: string;
}> {
  try {
    const all = await listEvolutionInstances();
    return {
      success: true,
      data: all.map((i) => ({
        name: i.name,
        connectionStatus: i.connectionStatus,
        profileName: i.profileName ?? null,
        ownerJid: i.ownerJid ?? null,
      })),
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "erro" };
  }
}

export async function syncWebhooksForInstances(instanceNames: string[]): Promise<{
  success: boolean;
  results?: Array<{ instance: string; ok: boolean; error?: string }>;
  error?: string;
}> {
  const url = process.env.N8N_WEBINAR_WEBHOOK_URL;
  if (!url) {
    return {
      success: false,
      error: "N8N_WEBINAR_WEBHOOK_URL não configurada no servidor",
    };
  }
  if (instanceNames.length === 0) {
    return { success: false, error: "nenhuma instância selecionada" };
  }
  const results = await Promise.all(
    instanceNames.map(async (name) => {
      const r = await setEvolutionWebhook(name, url);
      return { instance: name, ok: r.ok, error: r.error };
    }),
  );
  return { success: true, results };
}
