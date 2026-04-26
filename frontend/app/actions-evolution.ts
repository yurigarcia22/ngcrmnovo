"use server";

import { listEvolutionInstances } from "@/lib/webinar/evolution";

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
