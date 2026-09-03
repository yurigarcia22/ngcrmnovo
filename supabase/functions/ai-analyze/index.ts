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

const PROMPT_VERSION = 'crm-core-v0.3';

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
- IDIOMA: escreva TODOS os textos (summary, facts, next_best_action, service_interest) SEMPRE em português brasileiro, sem exceção — nunca em inglês, independente do idioma da conversa.
- Nunca invente informações. Diferencie fato explícito de inferência provável (use confidence menor).
- Não marque agendamento como confirmado sem confirmação explícita do cliente ("pode marcar", "confirmo") — horário oferecido não é agendamento.
- Pergunta de preço ("quanto custa?") é solicitação, NÃO objeção. Objeção exige sinal explícito ("tá caro").
- Não faça diagnóstico médico/veterinário. Sintomas relatados são registrados como relato, nunca como diagnóstico.
- Não classifique silêncio momentâneo como perda. Oportunidade perdida exige evidência observável.
- Não copie telefone/documentos/endereços para o resumo.
- origin_guess: só quando o cliente DECLARA de onde veio ("vi no Google", "fulano indicou"). Senão null.
- PACIENTE EXISTENTE: se a CLÍNICA inicia a conversa confirmando/remarcando consulta, cobrando retorno, ou trata de procedimento em andamento (ex.: "posso confirmar seu horário?", "finalizar o canal", "seu retorno"), classifique contact_classification=EXISTING_PATIENT — NÃO é NEW_LEAD, mesmo sem histórico anterior na conversa.
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
    .select('id, direction, content, transcription, type, created_at')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(80);
  // Texto efetivo: transcricao do audio > conteudo > placeholder de midia.
  // Clinica conversa MUITO por audio — sem transcricao o motor ficava cego.
  const PLACEHOLDERS = ['[Imagem]', '[Vídeo]', '[Áudio]', '[Documento]', '[Figurinha]', '[Localização]'];
  const withText = (msgs ?? []).map((m) => ({
    ...m,
    text: (m.transcription && !String(m.transcription).startsWith('[áudio sem'))
      ? `(áudio) ${m.transcription}`
      : (m.content && !PLACEHOLDERS.includes(m.content))
        ? m.content
        : (m.type && m.type !== 'text' ? `[${m.type}]` : ''),
  })).filter((m) => m.text !== '');
  const ordered = withText.reverse();
  if (ordered.length === 0) return { skipped: 'sem mensagens de texto' };

  const convo = ordered
    .map((m) => `[${m.direction === 'inbound' ? 'CLIENTE' : 'CLINICA'} ${String(m.created_at).slice(0, 16)}] ${String(m.text).slice(0, 400)}`)
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
  // Primeiro contato REAL = mensagem mais antiga do deal (nao o created_at,
  // que mente para conversas vindas do sync de historico)
  let firstContactAt: string | null = prevState?.first_contact_at ?? null;
  if (!firstContactAt) {
    const { data: firstMsg } = await supabase
      .from('messages').select('created_at').eq('deal_id', dealId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    firstContactAt = firstMsg?.created_at ?? null;
  }
  await supabase.from('deal_ai_state').upsert({
    deal_id: dealId, tenant_id: tenantId,
    first_contact_at: firstContactAt,
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

  // ============ FASE 3: PILOTO — mover o card no funil real ============
  // Guard-rails duros: so quando o ESTADO MUDOU nesta analise (respeita
  // movimentos humanos), so deal aberto, confianca >= limiar, mapeamento
  // explicito do tenant, NUNCA etapa de ganho/perda, NUNCA regressao.
  let moved: string | null = null;
  const stageChanged = prevState?.funnel_stage !== out.funnel_stage;
  if (settings.mode === 'pilot' && stageChanged && (out.confidence ?? 0) >= Number(settings.min_confidence_move ?? 0.85)) {
    try {
      const { data: dealRow } = await supabase
        .from('deals').select('id, status, stage_id, promoted_at')
        .eq('id', dealId).maybeSingle();
      if (dealRow?.status === 'open' && dealRow.stage_id != null) {
        const { data: cur } = await supabase
          .from('stages').select('id, position, pipeline_id')
          .eq('id', dealRow.stage_id).maybeSingle();
        const { data: map } = cur ? await supabase
          .from('ai_stage_mapping').select('stage_id')
          .eq('tenant_id', tenantId).eq('pipeline_id', cur.pipeline_id).eq('ai_stage', out.funnel_stage)
          .maybeSingle() : { data: null };
        if (cur && map?.stage_id && Number(map.stage_id) !== Number(dealRow.stage_id)) {
          const { data: target } = await supabase
            .from('stages').select('id, name, position, is_won, is_lost, is_inbox')
            .eq('id', map.stage_id).eq('tenant_id', tenantId).maybeSingle();
          if (target && !target.is_won && !target.is_lost && target.position > cur.position) {
            const patch: Record<string, unknown> = {
              stage_id: target.id,
              stage_entered_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (!dealRow.promoted_at && !target.is_inbox) patch.promoted_at = new Date().toISOString();
            const { error: mvErr } = await supabase
              .from('deals').update(patch).eq('id', dealId).eq('status', 'open');
            if (!mvErr) {
              moved = target.name;
              await supabase.from('crm_events').insert({
                tenant_id: tenantId, deal_id: dealId, source: 'ai',
                event_type: 'stage_moved_by_ai',
                previous_value: String(dealRow.stage_id), new_value: String(target.id),
                confidence: out.confidence,
              });
            }
          }
        }
      }
    } catch (e) { console.error('piloto (nao critico):', e); }
  }

  // ============ FASE 4: ALERTAS in-app para os admins do tenant ============
  // Entregues pelo sininho do CRM (tabela notifications). Cooldown por
  // deal+regra evita spam quando a conversa continua ativa.
  // Re-analise em massa (reset de last_analyzed_message_at) NAO dispara
  // alertas: alertar vale para MENSAGEM NOVA, nao para reprocessamento —
  // um reset geral gerava dezenas de notificacoes repetidas no sininho.
  const isBulkReanalysis = !!prevState && prevState.last_analyzed_message_at === null;
  if (settings.alerts_enabled !== false && !isBulkReanalysis) {
    try {
      const alerts: { rule: string; title: string; message: string; cooldownH: number }[] = [];
      const hot = Number(settings.hot_intent_threshold ?? 80);
      // So alerta "aguardando resposta" se a conversa e FRESCA (<24h): analise
      // de historico antigo nao pode disparar alerta de urgencia falso.
      const fresh = Date.now() - new Date(lastMsgAt).getTime() < 24 * 3600_000;
      if (fresh && (out.commercial_intent_score ?? 0) >= hot && out.waiting_for === 'BUSINESS') {
        alerts.push({ rule: 'hot_waiting', cooldownH: 4,
          title: '🔥 Lead quente aguardando resposta',
          message: `Intenção ${out.commercial_intent_score}/100 — ${String(out.summary ?? '').slice(0, 150)}` });
      }
      if (out.lost_opportunity?.detected && (out.lost_opportunity.confidence ?? 0) >= 0.8) {
        alerts.push({ rule: 'lost_suggested', cooldownH: 24,
          title: '⚠️ Possível oportunidade perdida',
          message: String(out.summary ?? '').slice(0, 170) });
      }
      if (out.appointment?.confirmed && !(prevState?.appointment as Record<string, unknown> | null)?.confirmed) {
        alerts.push({ rule: 'appointment', cooldownH: 24,
          title: '📅 Agendamento confirmado na conversa',
          message: String(out.summary ?? '').slice(0, 170) });
      }
      if (alerts.length > 0) {
        const { data: admins } = await supabase
          .from('profiles').select('id')
          .eq('tenant_id', tenantId).eq('role', 'admin').eq('is_active', true);
        for (const a of alerts) {
          const since = new Date(Date.now() - a.cooldownH * 3600_000).toISOString();
          const { data: dup } = await supabase
            .from('notifications').select('id')
            .eq('related_lead_id', dealId).eq('kind', 'ai_alert')
            .eq('meta_json->>rule', a.rule)
            .gte('created_at', since).limit(1).maybeSingle();
          if (dup) continue;
          const rows = (admins ?? []).map((p) => ({
            user_id: p.id, tenant_id: tenantId, related_lead_id: dealId,
            kind: 'ai_alert', title: a.title, message: a.message,
            channel: 'in_app',
            scheduled_for: new Date().toISOString(), sent_at: new Date().toISOString(),
            meta_json: { rule: a.rule, intent: out.commercial_intent_score, stage: out.funnel_stage },
          }));
          if (rows.length > 0) await supabase.from('notifications').insert(rows);
        }
      }
    } catch (e) { console.error('alertas (nao critico):', e); }
  }

  return { ok: true, stage: out.funnel_stage, intent: out.commercial_intent_score, moved, tokens: usage.total_tokens };
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
