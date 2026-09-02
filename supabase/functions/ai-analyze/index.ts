// =====================================================================
// MOTOR IA INTELIGENCIA — Fase 1 (modo OBSERVADOR)
// Analisa conversas de WhatsApp ja gravadas no banco (via Evolution) e
// transforma em dados estruturados (deal_ai_state / ai_analysis / crm_events).
//
// REGRA INEGOCIAVEL: este motor NUNCA envia mensagem. Nao ha nenhuma
// chamada de envio aqui — apenas leitura de mensagens e escrita de analise.
//
// Chamado pelo pg_cron a cada 2 min com header x-cron-key.
// Plano completo: docs/IA-INTELIGENCIA.md
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const PROMPT_VERSION = 'crm-core-v0.1';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Schema rigido (Structured Outputs): a IA nao devolve texto livre.
const ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    contact_classification: { type: 'string', enum: ['NEW_LEAD', 'EXISTING_PATIENT', 'NON_COMMERCIAL'] },
    funnel_stage: { type: 'string', enum: [
      'NEW_LEAD','QUALIFYING','QUALIFIED','SCHEDULING','SCHEDULED',
      'AWAITING_CUSTOMER','AWAITING_BUSINESS','NO_RESPONSE',
      'LOST_PRICE','LOST_AVAILABILITY','LOST_NO_RESPONSE','LOST_NOT_OFFERED','LOST_SERVICE_UNAVAILABLE','LOST_OTHER',
      'EXISTING_PATIENT','NON_COMMERCIAL','COMPLETED'] },
    service_interest: { type: 'array', items: { type: 'string' } },
    commercial_intent_score: { type: 'integer' },
    price: { type: 'object', additionalProperties: false, properties: {
      requested: { type: 'boolean' }, provided: { type: 'boolean' }, objection_detected: { type: 'boolean' } },
      required: ['requested', 'provided', 'objection_detected'] },
    appointment: { type: 'object', additionalProperties: false, properties: {
      requested: { type: 'boolean' }, offered: { type: 'boolean' }, confirmed: { type: 'boolean' } },
      required: ['requested', 'offered', 'confirmed'] },
    waiting_for: { type: 'string', enum: ['CUSTOMER', 'BUSINESS', 'NONE', 'UNKNOWN'] },
    lost_opportunity: { type: 'object', additionalProperties: false, properties: {
      detected: { type: 'boolean' }, reason: { type: ['string', 'null'] }, confidence: { type: 'number' } },
      required: ['detected', 'reason', 'confidence'] },
    extracted: { type: 'object', additionalProperties: false, properties: {
      animal_name: { type: ['string', 'null'] }, species: { type: ['string', 'null'] },
      reported_symptoms: { type: 'array', items: { type: 'string' } },
      urgency_language: { type: 'boolean' } },
      required: ['animal_name', 'species', 'reported_symptoms', 'urgency_language'] },
    origin_guess: { type: ['string', 'null'], description: 'origem declarada na conversa: google|site|indicacao|instagram|outro|null' },
    facts: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      fact: { type: 'string' }, confidence: { type: 'number' } }, required: ['fact', 'confidence'] } },
    summary: { type: 'string' },
    next_best_action: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['contact_classification','funnel_stage','service_interest','commercial_intent_score','price',
    'appointment','waiting_for','lost_opportunity','extracted','origin_guess','facts','summary','next_best_action','confidence'],
};

function systemPrompt(vertical: string, services: unknown): string {
  const vert = vertical === 'dentistry' ? 'clínica odontológica'
    : vertical === 'veterinary' ? 'clínica veterinária' : 'empresa';
  return `Você é o motor de inteligência de um CRM que analisa conversas reais de WhatsApp entre clientes e uma ${vert}.

Sua função NÃO é responder ao cliente. Sua função é observar a conversa, identificar fatos e transformar mensagens não estruturadas em dados para o CRM.

REGRAS CRÍTICAS
- Nunca invente informações. Diferencie fato explícito de inferência provável (use confidence menor).
- Não marque agendamento como confirmado sem confirmação explícita do cliente ("pode marcar", "confirmo") — horário oferecido não é agendamento.
- Pergunta de preço ("quanto custa?") é solicitação, NÃO objeção. Objeção exige sinal explícito ("tá caro").
- Não faça diagnóstico médico/veterinário. Sintomas relatados são registrados como relato, nunca como diagnóstico.
- Não classifique silêncio momentâneo como perda. Oportunidade perdida exige evidência observável.
- Não copie telefone/documentos/endereços para o resumo.
- origin_guess: só quando o cliente DECLARA de onde veio ("vi no Google", "fulano indicou"). Senão null.
- Pontuação de intenção (0-100): 0-20 sem intenção; 21-40 interesse inicial; 41-60 interesse claro em serviço; 61-80 buscando preço/disponibilidade/próximos passos; 81-100 intenção explícita de agendar/comprar/comparecer. Quantidade de mensagens não aumenta a pontuação.
- Resumo: objetivo, para um gestor entender em segundos.
- next_best_action é uma ação operacional interna ("Responder cliente", "Oferecer horários"...). NUNCA escreva a mensagem a ser enviada.
- Se receber ESTADO ANTERIOR, preserve fatos confirmados salvo evidência contrária.

VERTICAL=${vertical}
SERVIÇOS=${JSON.stringify(services ?? [])}

Responda exclusivamente o JSON do schema.`;
}

async function analyzeDeal(dealId: string, tenantId: string, settings: Record<string, unknown>, apiKey: string, pickLastMsgAt: string) {
  // 1. Conversa (ate 80 msgs mais recentes com conteudo; rotulada, sem PII)
  const { data: msgs } = await supabase
    .from('messages')
    .select('id, direction, content, created_at')
    .eq('deal_id', dealId)
    .neq('content', '')
    .order('created_at', { ascending: false })
    .limit(80);
  const ordered = (msgs ?? []).reverse();
  if (ordered.length === 0) return { skipped: 'sem mensagens de texto' };

  const convo = ordered
    .map((m) => `[${m.direction === 'inbound' ? 'CLIENTE' : 'CLINICA'} ${String(m.created_at).slice(0, 16)}] ${String(m.content).slice(0, 400)}`)
    .join('\n');

  // 2. Estado anterior (analise incremental)
  const { data: prevState } = await supabase
    .from('deal_ai_state').select('*').eq('deal_id', dealId).maybeSingle();

  const userContent =
    (prevState ? `ESTADO ANTERIOR:\n${JSON.stringify({
      funnel_stage: prevState.funnel_stage, intent_score: prevState.intent_score,
      service_interest: prevState.service_interest, appointment: prevState.appointment,
      price: prevState.price, summary: prevState.summary,
    })}\n\n` : '') + `CONVERSA:\n${convo}`;

  // 3. OpenAI com Structured Outputs
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.model || 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt(String(settings.vertical), settings.services) },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'conversation_analysis', strict: true, schema: ANALYSIS_SCHEMA } },
      reasoning_effort: 'low',
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!resp.ok) {
    const errText = (await resp.text()).slice(0, 300);
    throw new Error(`openai ${resp.status}: ${errText}`);
  }
  const result = await resp.json();
  const out = JSON.parse(result.choices[0].message.content);
  const usage = result.usage ?? {};
  // Marca d'agua: o MAX real do pick (inclui midia sem texto). Usar so a ultima
  // msg com texto deixava o deal eternamente elegivel quando a ultima era midia.
  const lastMsgAt = pickLastMsgAt;

  // 4. Historico imutavel
  await supabase.from('ai_analysis').insert({
    tenant_id: tenantId, deal_id: dealId,
    prompt_version: PROMPT_VERSION, model: String(settings.model || 'gpt-5-mini'),
    messages_from: ordered[0].created_at, messages_to: lastMsgAt,
    structured_output: out, summary: out.summary, confidence: out.confidence,
    input_tokens: usage.prompt_tokens ?? null, output_tokens: usage.completion_tokens ?? null,
  });

  // 5. Estado corrente (waiting_since e calculo do BACKEND, nao da IA)
  const waitingChanged = prevState?.waiting_on !== out.waiting_for;
  await supabase.from('deal_ai_state').upsert({
    deal_id: dealId, tenant_id: tenantId,
    funnel_stage: out.funnel_stage,
    intent_score: out.commercial_intent_score,
    service_interest: out.service_interest,
    waiting_on: out.waiting_for,
    waiting_since: waitingChanged ? new Date().toISOString() : (prevState?.waiting_since ?? new Date().toISOString()),
    appointment: out.appointment, price: out.price, extracted: out.extracted,
    summary: out.summary, next_action: out.next_best_action,
    lost_suggestion: out.lost_opportunity?.detected ? out.lost_opportunity : null,
    origin_guess: out.origin_guess,
    confidence: out.confidence,
    last_analyzed_message_at: lastMsgAt,
    updated_at: new Date().toISOString(),
  });

  // 6. Eventos (timeline auditavel)
  const events: Record<string, unknown>[] = [];
  if (prevState?.funnel_stage !== out.funnel_stage) {
    events.push({ event_type: 'ai_stage_changed', previous_value: prevState?.funnel_stage ?? null, new_value: out.funnel_stage, confidence: out.confidence });
  }
  if (out.appointment?.confirmed && !(prevState?.appointment as Record<string, unknown> | null)?.confirmed) {
    events.push({ event_type: 'appointment_confirmed', new_value: 'true', confidence: out.confidence });
  }
  if (out.lost_opportunity?.detected && !prevState?.lost_suggestion) {
    events.push({ event_type: 'ai_suggested_lost', new_value: String(out.lost_opportunity.reason ?? ''), confidence: out.lost_opportunity.confidence });
  }
  if (out.origin_guess && !prevState?.origin_guess) {
    events.push({ event_type: 'origin_declared', new_value: out.origin_guess, confidence: out.confidence });
  }
  if (events.length > 0) {
    await supabase.from('crm_events').insert(events.map((e) => ({ ...e, tenant_id: tenantId, deal_id: dealId, source: 'ai' })));
  }

  return { ok: true, stage: out.funnel_stage, intent: out.commercial_intent_score, tokens: usage.total_tokens };
}

Deno.serve(async (req) => {
  // Autorizacao do cron (a funcao nao e publica)
  const key = req.headers.get('x-cron-key');
  if (!key || key !== Deno.env.get('AI_CRON_KEY')) {
    return new Response('unauthorized', { status: 401 });
  }
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY ausente' }), { status: 500 });

  // Lote pequeno por rodada (backpressure — o cron roda a cada 2 min)
  // Lote 3 em PARALELO: o gateway derruba a funcao em 150s; 3 analises
  // simultaneas (~30-60s cada) cabem com folga. O cron roda a cada 2 min.
  const { data: picks, error } = await supabase.rpc('ai_pick_deals', { p_limit: 3 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const settingsCache = new Map<string, Record<string, unknown> | null>();
  async function getSettings(tenantId: string) {
    if (!settingsCache.has(tenantId)) {
      const { data } = await supabase.from('ai_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
      settingsCache.set(tenantId, data);
    }
    return settingsCache.get(tenantId);
  }

  const results = await Promise.all((picks ?? []).map(async (p: { deal_id: string; tenant_id: string; last_msg_at: string }) => {
    const settings = await getSettings(p.tenant_id);
    if (!settings?.enabled) return { deal: p.deal_id, skipped: 'tenant off' };
    try {
      const r = await analyzeDeal(p.deal_id, p.tenant_id, settings, apiKey, p.last_msg_at);
      return { deal: p.deal_id, ...r };
    } catch (e) {
      // Falha em um deal nao derruba o lote; marca o estado pra nao re-tentar em loop
      await supabase.from('deal_ai_state').upsert({
        deal_id: p.deal_id, tenant_id: p.tenant_id,
        last_analyzed_message_at: p.last_msg_at, updated_at: new Date().toISOString(),
      }, { ignoreDuplicates: false });
      return { deal: p.deal_id, error: String((e as Error).message).slice(0, 200) };
    }
  }));
  return new Response(JSON.stringify({ analyzed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
