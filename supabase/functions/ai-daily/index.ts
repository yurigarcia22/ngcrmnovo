// =====================================================================
// IA INTELIGENCIA — Daily Digest (Fase 4)
// 1x por dia: agrega o que a IA viu nas conversas do tenant e entrega um
// resumo executivo no sininho dos admins. NUNCA envia mensagem a lead.
// Chamado pelo pg_cron com header x-cron-key.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function digestForTenant(tenantId: string, settings: Record<string, unknown>, apiKey: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  // Metricas do dia (dados ja estruturados pelo motor; barato e deterministico)
  const [analyzed, states, events] = await Promise.all([
    supabase.from('ai_analysis').select('deal_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).gte('created_at', since),
    supabase.from('deal_ai_state')
      .select('funnel_stage, intent_score, waiting_on, service_interest, summary, lost_suggestion, deal:deals!deal_ai_state_deal_id_fkey(status, title)')
      .eq('tenant_id', tenantId),
    supabase.from('crm_events').select('event_type')
      .eq('tenant_id', tenantId).eq('source', 'ai').gte('created_at', since),
  ]);

  const open = (states.data ?? []).filter((s) => (s.deal as { status?: string } | null)?.status === 'open');
  const hot = open.filter((s) => (s.intent_score ?? 0) >= 70);
  const waiting = open.filter((s) => s.waiting_on === 'BUSINESS');
  const lost = open.filter((s) => !!s.lost_suggestion);
  const scheduled = (events.data ?? []).filter((e) => e.event_type === 'appointment_confirmed').length;
  const servicos = new Map<string, number>();
  for (const s of open) for (const sv of (s.service_interest ?? [])) servicos.set(sv, (servicos.get(sv) ?? 0) + 1);
  const topServicos = [...servicos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  if ((analyzed.count ?? 0) === 0 && waiting.length === 0 && hot.length === 0) {
    return { skipped: 'dia sem movimento' };
  }

  // Redacao do resumo pela IA (fatos vem prontos; ela so escreve)
  const facts = {
    conversas_analisadas_24h: analyzed.count ?? 0,
    agendamentos_detectados_24h: scheduled,
    abertas_alta_intencao: hot.length,
    aguardando_clinica_agora: waiting.length,
    possiveis_perdas: lost.length,
    top_servicos: topServicos.map(([s, n]) => `${s} (${n})`),
    destaques: hot.slice(0, 3).map((s) => ({ intencao: s.intent_score, resumo: String(s.summary ?? '').slice(0, 120) })),
  };
  let texto = '';
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model || 'gpt-5-mini',
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: 'Você escreve o resumo executivo diário de um CRM para o dono de uma clínica, em português, tom direto e humano, sem inventar nada além dos fatos fornecidos. Máximo 5 frases curtas. Sem saudação, sem markdown. Priorize o que exige ação (leads aguardando resposta, alta intenção).' },
          { role: 'user', content: JSON.stringify(facts) },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (resp.ok) texto = (await resp.json()).choices[0].message.content?.trim() ?? '';
  } catch (_e) { /* cai no fallback deterministico */ }
  if (!texto) {
    texto = `Hoje: ${facts.conversas_analisadas_24h} conversas analisadas, ${scheduled} agendamento(s) detectado(s). ` +
      `${waiting.length} conversa(s) aguardando resposta da clínica e ${hot.length} lead(s) de alta intenção em aberto.`;
  }

  const { data: admins } = await supabase
    .from('profiles').select('id')
    .eq('tenant_id', tenantId).eq('role', 'admin').eq('is_active', true);
  const rows = (admins ?? []).map((p) => ({
    user_id: p.id, tenant_id: tenantId,
    kind: 'ai_digest', title: '🧠 Resumo do dia — Inteligência',
    message: texto.slice(0, 900), channel: 'in_app',
    scheduled_for: new Date().toISOString(), sent_at: new Date().toISOString(),
    meta_json: facts,
  }));
  if (rows.length > 0) await supabase.from('notifications').insert(rows);
  await supabase.from('crm_events').insert({
    tenant_id: tenantId, source: 'system', event_type: 'daily_digest', new_value: texto.slice(0, 400),
  });
  return { ok: true, admins: rows.length };
}

Deno.serve(async (req) => {
  const key = req.headers.get('x-cron-key');
  if (!key || key !== Deno.env.get('AI_CRON_KEY')) return new Response('unauthorized', { status: 401 });
  const apiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

  const { data: tenants } = await supabase
    .from('ai_settings').select('*').eq('enabled', true).eq('daily_digest', true);
  const results: Record<string, unknown>[] = [];
  for (const t of tenants ?? []) {
    try { results.push({ tenant: t.tenant_id, ...(await digestForTenant(t.tenant_id, t, apiKey)) }); }
    catch (e) { results.push({ tenant: t.tenant_id, error: String((e as Error).message).slice(0, 150) }); }
  }
  return new Response(JSON.stringify({ results }), { headers: { 'Content-Type': 'application/json' } });
});
