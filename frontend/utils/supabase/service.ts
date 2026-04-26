import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com SERVICE_ROLE — bypass RLS.
 *
 * Use SOMENTE em rotas/actions chamadas pelo sistema (webhooks, crons),
 * NUNCA em rotas que recebem input direto de usuario sem validacao.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL nao configurados");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
