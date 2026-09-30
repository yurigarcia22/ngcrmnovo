// =====================================================================
// MOTOR IA INTELIGENCIA — Fase 1 (modo OBSERVADOR)
// Analisa conversas de WhatsApp ja gravadas no banco (via Evolution) e
// transforma em dados estruturados (deal_ai_state / ai_analysis / crm_events).
//
// REGRA INEGOCIAVEL: este motor NUNCA envia mensagem. Nao ha nenhuma
// chamada de envio aqui — apenas leitura de mensagens e escrita de analise.
//
// Dois motores gravam pelo MESMO codigo (aplicarAnalise):
//   - GPT: chamado pelo pg_cron a cada 2 min com header x-cron-key.
//   - Hermes (agente local com Opus): rotas /lote/* com header x-lote-key.
//     Ele pede conversas pendentes, analisa fora daqui e devolve o JSON no
//     schema abaixo. Cliente com ai_settings.motor = 'hermes' sai da fila do
//     GPT, que so volta a analisar se o Hermes sumir 2h no horario comercial.
// Plano completo: docs/IA-INTELIGENCIA.md
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const PROMPT_VERSION = 'crm-core-v0.5';

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
      requested: { type: 'boolean' }, offered: { type: 'boolean' }, confirmed: { type: 'boolean' },
      confirmed_in_message_at: { type: ['string', 'null'], description: 'carimbo AAAA-MM-DDTHH:MM (do rotulo da conversa) da mensagem que fechou o acordo de horario MAIS RECENTE; null se nao confirmado' } },
      required: ['requested', 'offered', 'confirmed', 'confirmed_in_message_at'] },
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
- AGENDAMENTO CONFIRMADO exige acordo explícito sobre um horário: o cliente aceita um horário oferecido ("pode sim", "pode ser", "combinado", "confirmo", 👍 respondendo diretamente à oferta); o cliente pede dia/horário e a empresa confirma ("vou deixar agendado", "agendado"); ou o cliente afirma que vai levar/comparecer em data definida ("amanhã levo ela"). Horário apenas oferecido e sem resposta NÃO é agendamento. Se a conversa tiver mais de um agendamento, considere SEMPRE o MAIS RECENTE. Em appointment.confirmed_in_message_at copie o carimbo AAAA-MM-DDTHH:MM do rótulo da mensagem que fechou esse acordo mais recente (null se não confirmado).
- Pergunta de preço ("quanto custa?") é solicitação, NÃO objeção. Objeção exige sinal explícito ("tá caro").
- Não faça diagnóstico médico/veterinário. Sintomas relatados são registrados como relato, nunca como diagnóstico.
- Não classifique silêncio momentâneo como perda. Oportunidade perdida exige evidência observável.
- Não copie telefone/documentos/endereços para o resumo.
- origin_guess: só quando o cliente DECLARA de onde veio ("vi no Google", "fulano indicou"). Senão null.
- PACIENTE EXISTENTE: se QUALQUER um dos lados indicar relação já existente ou continuidade de tratamento — clínica confirmando/remarcando consulta, cobrando retorno, OU o cliente pedindo para "finalizar/terminar/continuar" um procedimento ("finalizar o canal", "terminar meu tratamento", "minha manutenção", "a doutora ficou de..."), citando o dentista pelo nome como quem já o conhece, ou mencionando consulta/exame anterior — classifique contact_classification=EXISTING_PATIENT. NEW_LEAD é somente quem demonstra PRIMEIRO contato com a clínica.
- HISTÓRICO: se a conversa tem mensagens de semanas ou meses antes entre o mesmo contato e a empresa, o contato NÃO é NEW_LEAD.
- PET SHOP/VETERINÁRIA: são sinais de cliente existente pedir serviço recorrente para o pet citado pelo nome como rotina ("deixa o Tony aí pra banho", "tem horário pro Paçoca amanhã?"), falar com o atendente pelo nome como conhecido, citar funcionário da casa, ou a empresa tratar o cliente/pet pelo nome sem apresentação. Conversa que começa no meio (respostas como "pode sim", "ok", "certinho" sem pergunta visível) indica relação anterior.
- NON_COMMERCIAL: fornecedor, representante comercial ou vendedor oferecendo produto/serviço PARA a empresa, cobrança de sistema, bot, spam, e contato pessoal/interno da equipe (números soltos, anotações, links sem pedido). Nunca classifique esses como NEW_LEAD.
- Pontuação de intenção (0-100): 0-20 sem intenção; 21-40 interesse inicial; 41-60 interesse claro em serviço; 61-80 buscando preço/disponibilidade/próximos passos; 81-100 intenção explícita de agendar/comprar/comparecer. Quantidade de mensagens não aumenta a pontuação.
- Resumo: objetivo, para um gestor entender em segundos.
- next_best_action é uma ação operacional interna ("Responder cliente", "Oferecer horários"...). NUNCA escreva a mensagem a ser enviada.
- Se receber ESTADO ANTERIOR, preserve fatos confirmados salvo evidência contrária.

VERTICAL=${vertical}
SERVIÇOS=${JSON.stringify(services ?? [])}

Responda exclusivamente o JSON do schema.`;
}

// Texto efetivo: transcricao do audio > conteudo > placeholder de midia.
// Clinica conversa MUITO por audio — sem transcricao o motor ficava cego.
const PLACEHOLDERS = ['[Imagem]', '[Vídeo]', '[Áudio]', '[Documento]', '[Figurinha]', '[Localização]'];

// Horario LOCAL da clinica. O banco guarda em UTC; rotular a conversa em UTC
// fazia o modelo achar que "as 16h" era antes de mensagens mandadas as 13h e
// errar "hoje"/"amanha". Fuso vem de ai_settings.timezone (Cuiaba e -4).
function rotuloLocal(iso: string, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// Caminho inverso: rotulo AAAA-MM-DDTHH:MM no fuso da clinica -> instante real.
function localParaInstante(rotulo: string, tz: string): Date {
  const comoUtc = new Date(`${rotulo.slice(0, 16)}:00Z`);
  const lido = rotuloLocal(comoUtc.toISOString(), tz);
  const deslocamento = new Date(`${lido}:00Z`).getTime() - comoUtc.getTime();
  return new Date(comoUtc.getTime() - deslocamento);
}

const fusoDe = (settings: Record<string, unknown> | null | undefined) =>
  String(settings?.timezone || 'America/Sao_Paulo');

type Msg = { id: string; direction: string; content: string | null; transcription: string | null; type: string | null; created_at: string; text: string };
type Conversa = { ordered: Msg[]; prevState: Record<string, unknown> | null; userContent: string };

// Passos 1 e 2: a conversa como o motor enxerga (ate 80 msgs mais recentes com
// conteudo, rotuladas, sem PII) + estado anterior para analise incremental.
async function carregarConversa(dealId: string, tz = 'America/Sao_Paulo'): Promise<Conversa | null> {
  const { data: msgs } = await supabase
    .from('messages')
    .select('id, direction, content, transcription, type, created_at')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(80);
  const withText = (msgs ?? []).map((m) => ({
    ...m,
    text: (m.transcription && !String(m.transcription).startsWith('[áudio sem'))
      ? `(áudio) ${m.transcription}`
      : (m.content && !PLACEHOLDERS.includes(m.content))
        ? m.content
        : (m.type && m.type !== 'text' ? `[${m.type}]` : ''),
  })).filter((m) => m.text !== '') as Msg[];
  const ordered = withText.reverse();
  if (ordered.length === 0) return null;

  const convo = ordered
    .map((m) => `[${m.direction === 'inbound' ? 'CLIENTE' : 'CLINICA'} ${rotuloLocal(m.created_at, tz)}] ${String(m.text).slice(0, 400)}`)
    .join('\n');

  const { data: prevState } = await supabase
    .from('deal_ai_state').select('*').eq('deal_id', dealId).maybeSingle();

  const userContent =
    (prevState ? `ESTADO ANTERIOR:\n${JSON.stringify({
      funnel_stage: prevState.funnel_stage, intent_score: prevState.intent_score,
      service_interest: prevState.service_interest, appointment: prevState.appointment,
      price: prevState.price, summary: prevState.summary,
    })}\n\n` : '') + `CONVERSA (horários no fuso local da clínica, ${tz}):\n${convo}`;

  return { ordered, prevState, userContent };
}

// Passos 4 em diante: grava o resultado com as regras do BACKEND (primeiro
// contato, data do agendamento, eventos, piloto e alertas). Igual para os dois
// motores — o modelo so muda o que vai em ai_analysis.model.
async function aplicarAnalise(p: {
  dealId: string; tenantId: string; settings: Record<string, unknown>;
  // deno-lint-ignore no-explicit-any
  out: any; usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  modelo: string; lastMsgAt: string; conversa: Conversa;
}) {
  const { dealId, tenantId, settings, out, usage, conversa } = p;
  const { ordered, prevState } = conversa;
  // Marca d'agua: o MAX real do pick (inclui midia sem texto). Usar so a ultima
  // msg com texto deixava o deal eternamente elegivel quando a ultima era midia.
  const lastMsgAt = p.lastMsgAt;

  // 4. Historico imutavel
  await supabase.from('ai_analysis').insert({
    tenant_id: tenantId, deal_id: dealId,
    prompt_version: PROMPT_VERSION, model: p.modelo,
    messages_from: ordered[0].created_at, messages_to: lastMsgAt,
    structured_output: out, summary: out.summary, confidence: out.confidence,
    input_tokens: usage.prompt_tokens ?? null, output_tokens: usage.completion_tokens ?? null,
  });

  // 5. Estado corrente (waiting_since e calculo do BACKEND, nao da IA)
  const waitingChanged = prevState?.waiting_on !== out.waiting_for;
  // Primeiro contato REAL = mensagem mais antiga do deal (nao o created_at,
  // que mente para conversas vindas do sync de historico)
  let firstContactAt: string | null = (prevState?.first_contact_at as string | null) ?? null;
  if (!firstContactAt) {
    const { data: firstMsg } = await supabase
      .from('messages').select('created_at').eq('deal_id', dealId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    firstContactAt = firstMsg?.created_at ?? null;
  }

  // Quem ja conversava com a empresa antes do inicio da analise nao e lead
  // novo, mesmo que a IA so enxergue o trecho recente da conversa.
  let contactClassification = out.contact_classification;
  const analyzeFrom = settings.analyze_from ? new Date(String(settings.analyze_from)) : null;
  if (contactClassification === 'NEW_LEAD' && firstContactAt && analyzeFrom
      && new Date(firstContactAt) < analyzeFrom) {
    contactClassification = 'EXISTING_PATIENT';
  }

  const isBulkReanalysis = !!prevState && prevState.last_analyzed_message_at === null;

  // Data REAL da confirmacao: a mensagem que a IA apontou como fechamento do
  // acordo (validada dentro da janela da conversa). Sem ela, a ultima mensagem
  // do lote em que confirmed virou true.
  const prevConfirmed = !!(prevState?.appointment as Record<string, unknown> | null)?.confirmed;
  let confirmedMsgAt: string | null = null;
  const rawConfirmed = out.appointment?.confirmed ? out.appointment?.confirmed_in_message_at : null;
  if (typeof rawConfirmed === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(rawConfirmed)) {
    const parsed = /[zZ]|[+-]\d{2}:?\d{2}$/.test(rawConfirmed)
      ? new Date(rawConfirmed) : localParaInstante(rawConfirmed, fusoDe(settings));
    const windowStart = new Date(ordered[0].created_at).getTime() - 60_000;
    const windowEnd = new Date(lastMsgAt).getTime() + 60_000;
    if (!isNaN(parsed.getTime()) && parsed.getTime() >= windowStart && parsed.getTime() <= windowEnd) {
      confirmedMsgAt = parsed.toISOString();
    }
  }
  let appointmentConfirmedAt: string | null = (prevState?.appointment_confirmed_at as string | null) ?? null;
  if (out.appointment?.confirmed) {
    if (!prevConfirmed) appointmentConfirmedAt = confirmedMsgAt ?? lastMsgAt;
    else if (confirmedMsgAt && (isBulkReanalysis || !appointmentConfirmedAt)) appointmentConfirmedAt = confirmedMsgAt;
  }

  await supabase.from('deal_ai_state').upsert({
    deal_id: dealId, tenant_id: tenantId,
    contact_classification: contactClassification,
    first_contact_at: firstContactAt,
    appointment_confirmed_at: appointmentConfirmedAt,
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
          const rows = (admins ?? []).map((pr) => ({
            user_id: pr.id, tenant_id: tenantId, related_lead_id: dealId,
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

async function analyzeDeal(dealId: string, tenantId: string, settings: Record<string, unknown>, apiKey: string, pickLastMsgAt: string) {
  // 1-2. Conversa + estado anterior
  const conversa = await carregarConversa(dealId, fusoDe(settings));
  if (!conversa) return { skipped: 'sem mensagens de texto' };

  // 3. OpenAI com Structured Outputs
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.model || 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt(String(settings.vertical), settings.services) },
        { role: 'user', content: conversa.userContent },
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

  return await aplicarAnalise({
    dealId, tenantId, settings, out, usage,
    modelo: String(settings.model || 'gpt-5-mini'),
    lastMsgAt: pickLastMsgAt, conversa,
  });
}

// =====================================================================
// API DE LOTE (Hermes). O Hermes nunca toca no banco: so pede conversas e
// devolve analises. A chave x-lote-key so abre estas rotas, e so da para
// devolver resultado de card que o proprio Hermes reservou.
// =====================================================================

// Valida contra o ANALYSIS_SCHEMA e devolve so os campos conhecidos.
// deno-lint-ignore no-explicit-any
function conferir(valor: any, schema: any, caminho: string): { ok: true; valor: unknown } | { ok: false; erro: string } {
  const tipos: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
  const tipoDe = (v: unknown) => v === null ? 'null' : Array.isArray(v) ? 'array'
    : (typeof v === 'number' && Number.isInteger(v)) ? 'integer' : typeof v;
  const t = tipoDe(valor);
  const aceito = tipos.includes(t) || (t === 'integer' && tipos.includes('number'));
  if (!aceito) return { ok: false, erro: `${caminho}: esperado ${tipos.join('|')}, veio ${t}` };
  if (schema.enum && !schema.enum.includes(valor)) return { ok: false, erro: `${caminho}: valor fora da lista (${String(valor)})` };
  if (t === 'string') return { ok: true, valor: String(valor).slice(0, 2000) };
  if (t === 'array') {
    const itens: unknown[] = [];
    for (let i = 0; i < Math.min(valor.length, 30); i++) {
      const r = conferir(valor[i], schema.items, `${caminho}[${i}]`);
      if (!r.ok) return r;
      itens.push(r.valor);
    }
    return { ok: true, valor: itens };
  }
  if (t === 'object') {
    const limpo: Record<string, unknown> = {};
    for (const campo of schema.required ?? []) {
      if (!(campo in valor)) return { ok: false, erro: `${caminho}.${campo}: campo obrigatório ausente` };
    }
    for (const [campo, sub] of Object.entries(schema.properties ?? {})) {
      if (!(campo in valor)) continue;
      const r = conferir(valor[campo], sub, `${caminho}.${campo}`);
      if (!r.ok) return r;
      limpo[campo] = r.valor;
    }
    return { ok: true, valor: limpo };
  }
  return { ok: true, valor };
}

async function rotaLote(req: Request, url: URL): Promise<Response> {
  const chave = Deno.env.get('AI_LOTE_KEY');
  if (!chave || req.headers.get('x-lote-key') !== chave) {
    return new Response('unauthorized', { status: 401 });
  }
  const rota = url.pathname.split('/lote/')[1] ?? '';

  const settingsCache = new Map<string, Record<string, unknown> | null>();
  async function getSettings(tenantId: string) {
    if (!settingsCache.has(tenantId)) {
      const { data } = await supabase.from('ai_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
      settingsCache.set(tenantId, data);
    }
    return settingsCache.get(tenantId);
  }

  // Instrucoes e schema: o Hermes pega daqui, nunca guarda copia propria.
  if (rota === 'instrucoes') {
    return Response.json({
      prompt_version: PROMPT_VERSION,
      schema: ANALYSIS_SCHEMA,
      como_responder: 'Para cada conversa, devolva um objeto { deal_id, analise } onde analise segue exatamente o schema. ' +
        'Envie em POST /lote/resultado como { modelo, uso: { entrada, saida }, resultados: [...] }.',
    });
  }

  // Conversas pendentes, agrupadas por cliente (cada um com suas instrucoes).
  if (rota === 'pendentes') {
    let limite = 10;
    try {
      const body = await req.json();
      if (Number.isInteger(body?.limite)) limite = Math.min(Math.max(body.limite, 1), 30);
    } catch { /* corpo vazio = padrao */ }

    const { data: picks, error } = await supabase.rpc('ai_pick_deals_lote', { p_limit: limite });
    if (error) return Response.json({ erro: error.message }, { status: 500 });

    const porCliente = new Map<string, { tenant_id: string; nome: string | null; instrucoes: string; conversas: unknown[] }>();
    let semTexto = 0;
    for (const p of (picks ?? []) as { deal_id: string; tenant_id: string; last_msg_at: string }[]) {
      const settingsCli = await getSettings(p.tenant_id);
      const conversa = await carregarConversa(p.deal_id, fusoDe(settingsCli));
      if (!conversa) {
        // So midia sem texto: marca como vista e solta a reserva (senao volta pra fila sempre)
        await supabase.from('deal_ai_state').upsert({
          deal_id: p.deal_id, tenant_id: p.tenant_id,
          last_analyzed_message_at: p.last_msg_at, updated_at: new Date().toISOString(),
        });
        await supabase.from('ai_lote_reserva').delete().eq('deal_id', p.deal_id);
        semTexto++;
        continue;
      }
      if (!porCliente.has(p.tenant_id)) {
        const settings = await getSettings(p.tenant_id);
        const { data: t } = await supabase.from('tenants').select('name').eq('id', p.tenant_id).maybeSingle();
        porCliente.set(p.tenant_id, {
          tenant_id: p.tenant_id, nome: t?.name ?? null,
          instrucoes: systemPrompt(String(settings?.vertical), settings?.services),
          conversas: [],
        });
      }
      porCliente.get(p.tenant_id)!.conversas.push({
        deal_id: p.deal_id, ultima_mensagem_em: p.last_msg_at, entrada: conversa.userContent,
      });
    }
    const total = [...porCliente.values()].reduce((n, c) => n + c.conversas.length, 0);
    const { data: rodada } = await supabase.from('ai_lote_rodadas')
      .insert({ tipo: 'pendentes', qtd: total, detalhe: { sem_texto: semTexto } }).select('id').single();
    return Response.json({ rodada: rodada?.id ?? null, total, clientes: [...porCliente.values()] });
  }

  // Resultado: valida e grava pelo mesmo caminho do GPT.
  if (rota === 'resultado') {
    // deno-lint-ignore no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return Response.json({ erro: 'JSON inválido' }, { status: 400 }); }
    const modelo = typeof body?.modelo === 'string' && body.modelo.trim() ? body.modelo.trim().slice(0, 60) : 'hermes';
    const lista = Array.isArray(body?.resultados) ? body.resultados.slice(0, 30) : [];
    if (lista.length === 0) return Response.json({ erro: 'resultados vazio' }, { status: 400 });
    const entrada = Number(body?.uso?.entrada ?? 0) || 0;
    const saida = Number(body?.uso?.saida ?? 0) || 0;
    const usage = {
      prompt_tokens: entrada ? Math.round(entrada / lista.length) : undefined,
      completion_tokens: saida ? Math.round(saida / lista.length) : undefined,
      total_tokens: (entrada + saida) ? Math.round((entrada + saida) / lista.length) : undefined,
    };

    const respostas: Record<string, unknown>[] = [];
    let gravados = 0, erros = 0;
    for (const item of lista) {
      const dealId = String(item?.deal_id ?? '');
      try {
        const { data: reserva } = await supabase.from('ai_lote_reserva')
          .select('deal_id, tenant_id, ultima_msg, ate').eq('deal_id', dealId).maybeSingle();
        if (!reserva) throw new Error('card não reservado para o Hermes (peça em /lote/pendentes)');
        if (new Date(reserva.ate).getTime() < Date.now()) throw new Error('reserva expirada; o card volta na próxima rodada');

        const r = conferir(item?.analise, ANALYSIS_SCHEMA, 'analise');
        if (!r.ok) throw new Error(r.erro);
        // deno-lint-ignore no-explicit-any
        const out = r.valor as any;
        out.commercial_intent_score = Math.max(0, Math.min(100, Math.round(out.commercial_intent_score)));
        out.confidence = Math.max(0, Math.min(1, Number(out.confidence)));

        const settings = await getSettings(reserva.tenant_id);
        if (!settings?.enabled) throw new Error('IA desligada para este cliente');
        const conversa = await carregarConversa(dealId, fusoDe(settings));
        if (!conversa) throw new Error('conversa sem texto');

        const res = await aplicarAnalise({
          dealId, tenantId: reserva.tenant_id, settings, out, usage,
          modelo, lastMsgAt: reserva.ultima_msg, conversa,
        });
        await supabase.from('ai_lote_reserva').delete().eq('deal_id', dealId);
        gravados++;
        respostas.push({ deal_id: dealId, ok: true, etapa: res.stage, movido_para: res.moved });
      } catch (e) {
        erros++;
        respostas.push({ deal_id: dealId, ok: false, erro: String((e as Error).message).slice(0, 300) });
      }
    }
    await supabase.from('ai_lote_rodadas').insert({
      tipo: 'resultado', qtd: lista.length, gravados, erros, modelo,
      tokens_entrada: entrada || null, tokens_saida: saida || null,
    });
    return Response.json({ gravados, erros, resultados: respostas });
  }

  // Relatorio de atendimento (so leitura): numeros por cliente numa janela local.
  if (rota === 'relatorio') {
    // deno-lint-ignore no-explicit-any
    let body: any = {};
    try { body = await req.json(); } catch { /* usa erro abaixo */ }
    try {
      return Response.json(await relatorioAtendimento(String(body?.inicio ?? ''), String(body?.fim ?? '')));
    } catch (e) {
      return Response.json({ erro: String((e as Error).message).slice(0, 300) }, { status: 400 });
    }
  }

  return Response.json({ erro: 'rota desconhecida', rotas: ['instrucoes', 'pendentes', 'resultado', 'relatorio'] }, { status: 404 });
}

// =====================================================================
// RELATORIO DE ATENDIMENTO (Hermes, rota /lote/relatorio). SO LEITURA.
// Janela em horario LOCAL de cada clinica (inicio/fim "AAAA-MM-DDTHH:MM").
// Tempo de resposta conta so minutos de expediente (07h-18h, seg a sab),
// para mensagem da madrugada respondida as 7h nao virar "8h de demora".
// Conversa marcada pela IA como NON_COMMERCIAL fica fora do tempo de resposta.
// =====================================================================
const EXPEDIENTE = { de: 7, ate: 18 };
const pad2 = (n: number) => String(n).padStart(2, '0');

function minutosUteis(aMs: number, bMs: number, tz: string): number {
  if (bMs <= aMs) return 0;
  let total = 0;
  let dia = rotuloLocal(new Date(aMs).toISOString(), tz).slice(0, 10);
  for (let i = 0; i < 60; i++) {
    const ini = localParaInstante(`${dia}T${pad2(EXPEDIENTE.de)}:00`, tz).getTime();
    const fim = localParaInstante(`${dia}T${pad2(EXPEDIENTE.ate)}:00`, tz).getTime();
    if (ini > bMs) break;
    const meioDia = new Date(`${dia}T12:00:00Z`);
    if (meioDia.getUTCDay() !== 0) total += Math.max(0, Math.min(fim, bMs) - Math.max(ini, aMs));
    meioDia.setUTCDate(meioDia.getUTCDate() + 1);
    dia = meioDia.toISOString().slice(0, 10);
  }
  return total / 60000;
}

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

async function relatorioAtendimento(inicioL: string, fimL: string) {
  const formato = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!formato.test(inicioL) || !formato.test(fimL)) throw new Error('inicio e fim no formato AAAA-MM-DDTHH:MM (horario local)');
  const { data: cfgs, error: eCfg } = await supabase.from('ai_settings')
    .select('tenant_id, timezone, hot_intent_threshold').eq('enabled', true);
  if (eCfg) throw new Error(eCfg.message);
  const agora = Date.now();
  const clientes: Record<string, unknown>[] = [];

  for (const cfg of cfgs ?? []) {
    const tz = fusoDe(cfg);
    const quente = Number(cfg.hot_intent_threshold ?? 80);
    const ini = localParaInstante(inicioL, tz).getTime();
    const fim = Math.min(localParaInstante(fimL, tz).getTime(), agora);
    const { data: t } = await supabase.from('tenants').select('name').eq('id', cfg.tenant_id).maybeSingle();

    // Mensagens da janela + 12h antes (para saber quem ja chegou esperando)
    const msgs: { deal_id: string; direction: string; created_at: string }[] = [];
    for (let de = 0; de < 30000; de += 1000) {
      const { data, error } = await supabase.from('messages').select('deal_id, direction, created_at')
        .eq('tenant_id', cfg.tenant_id).not('deal_id', 'is', null)
        .gte('created_at', new Date(ini - 12 * 3600_000).toISOString())
        .lte('created_at', new Date(fim).toISOString())
        .order('created_at', { ascending: true }).range(de, de + 999);
      if (error) throw new Error(error.message);
      msgs.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const porDeal = new Map<string, { inbound: boolean; t: number }[]>();
    let recebidas = 0, enviadas = 0;
    for (const m of msgs) {
      const tm = new Date(m.created_at).getTime();
      if (!porDeal.has(m.deal_id)) porDeal.set(m.deal_id, []);
      porDeal.get(m.deal_id)!.push({ inbound: m.direction === 'inbound', t: tm });
      if (tm >= ini) { if (m.direction === 'inbound') recebidas++; else enviadas++; }
    }
    const ativos = [...porDeal.entries()].filter(([, l]) => l.some((x) => x.t >= ini)).map(([id]) => id);

    // Estado da IA dos cards ativos
    // deno-lint-ignore no-explicit-any
    const estados = new Map<string, any>();
    for (let i = 0; i < ativos.length; i += 150) {
      const { data, error } = await supabase.from('deal_ai_state')
        .select('deal_id, contact_classification, funnel_stage, intent_score, service_interest, waiting_on, price, lost_suggestion, summary, first_contact_at')
        .in('deal_id', ativos.slice(i, i + 150));
      if (error) throw new Error(error.message);
      for (const e of data ?? []) estados.set(e.deal_id, e);
    }

    const tempos: number[] = [], primeiras: number[] = [];
    const pendentes: { min: number; novo: boolean; quente: boolean }[] = [];
    const classes = { NEW_LEAD: 0, EXISTING_PATIENT: 0, NON_COMMERCIAL: 0, sem_analise: 0 };
    const servicos = new Map<string, number>();
    let precoSemResposta = 0;
    // deno-lint-ignore no-explicit-any
    const amostras: any[] = [];

    for (const id of ativos) {
      const e = estados.get(id);
      const cls = e?.contact_classification as keyof typeof classes | undefined;
      if (cls && cls in classes) classes[cls]++; else classes.sem_analise++;
      if (cls === 'NON_COMMERCIAL') continue;
      for (const s of (e?.service_interest ?? [])) servicos.set(s, (servicos.get(s) ?? 0) + 1);
      const novoNaJanela = cls === 'NEW_LEAD' && e?.first_contact_at && new Date(e.first_contact_at).getTime() >= ini;

      let esperando: number | null = null, primeiraFeita = false;
      for (const m of porDeal.get(id)!) {
        if (m.inbound) { if (esperando === null) esperando = m.t; continue; }
        if (esperando !== null && m.t >= ini) {
          const min = minutosUteis(esperando, m.t, tz);
          tempos.push(min);
          if (novoNaJanela && !primeiraFeita) primeiras.push(min);
        }
        if (esperando !== null) primeiraFeita = true;
        esperando = null;
      }
      // Pendente = a IA leu a conversa e concluiu que a CLINICA deve resposta.
      // "ok", "obrigada", "ja vou buscar" ficam fora (waiting_on NONE/CUSTOMER).
      if (esperando !== null && e?.waiting_on === 'BUSINESS') {
        const q = (e?.intent_score ?? 0) >= quente;
        pendentes.push({ min: minutosUteis(esperando, fim, tz), novo: cls === 'NEW_LEAD', quente: q });
        if (e?.price?.requested && !e?.price?.provided) precoSemResposta++;
        if ((q || cls === 'NEW_LEAD') && e?.summary && amostras.length < 6) {
          amostras.push({ tipo: 'esperando_resposta', espera_min: Math.round(minutosUteis(esperando, fim, tz)), intencao: e.intent_score, resumo: String(e.summary).slice(0, 180) });
        }
      }
    }

    // Agendamentos: horario da mensagem que confirmou (nao o da analise)
    const { data: ag } = await supabase.from('deal_ai_state').select('deal_id, contact_classification, service_interest')
      .eq('tenant_id', cfg.tenant_id)
      .gte('appointment_confirmed_at', new Date(ini).toISOString()).lte('appointment_confirmed_at', new Date(fim).toISOString());
    const { data: ev } = await supabase.from('crm_events').select('event_type, new_value')
      .eq('tenant_id', cfg.tenant_id).eq('source', 'ai').in('event_type', ['ai_suggested_lost', 'origin_declared'])
      .gte('created_at', new Date(ini).toISOString()).lte('created_at', new Date(fim + 3600_000).toISOString());
    const perdas = (ev ?? []).filter((x) => x.event_type === 'ai_suggested_lost').map((x) => String(x.new_value ?? '').slice(0, 160));
    const origens: Record<string, number> = {};
    for (const x of (ev ?? []).filter((x) => x.event_type === 'origin_declared')) origens[String(x.new_value)] = (origens[String(x.new_value)] ?? 0) + 1;

    const r = (v: number) => Math.round(v);
    clientes.push({
      cliente: t?.name ?? cfg.tenant_id, fuso: tz,
      janela_local: { inicio: inicioL, fim: rotuloLocal(new Date(fim).toISOString(), tz) },
      conversas_ativas: ativos.length, por_tipo: classes,
      mensagens: { recebidas, enviadas },
      tempo_resposta_min: {
        respostas: tempos.length, mediana: mediana(tempos),
        media: tempos.length ? r(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null,
        pct_ate_15min: tempos.length ? r(100 * tempos.filter((x) => x <= 15).length / tempos.length) : null,
        acima_1h: tempos.filter((x) => x > 60).length,
      },
      primeira_resposta_lead_novo_min: { leads: primeiras.length, mediana: mediana(primeiras) },
      sem_resposta_no_fim_da_janela: {
        total: pendentes.length,
        acima_30min: pendentes.filter((p) => p.min > 30).length,
        acima_1h: pendentes.filter((p) => p.min > 60).length,
        leads_novos: pendentes.filter((p) => p.novo).length,
        alta_intencao: pendentes.filter((p) => p.quente).length,
        pediram_preco_sem_resposta: precoSemResposta,
        maior_espera_min: pendentes.length ? r(Math.max(...pendentes.map((p) => p.min))) : 0,
      },
      agendamentos_confirmados: (ag ?? []).length,
      agendamentos_de_lead_novo: (ag ?? []).filter((x) => x.contact_classification === 'NEW_LEAD').length,
      perdas_sugeridas: { total: perdas.length, motivos: perdas.slice(0, 8) },
      servicos_mais_citados: [...servicos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => ({ servico: s, conversas: n })),
      origens_declaradas: origens,
      amostras_para_contexto: amostras,
    });
  }
  return { gerado_em: new Date(agora).toISOString(), expediente: `${EXPEDIENTE.de}h-${EXPEDIENTE.ate}h seg-sab`, clientes };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname.includes('/lote/')) return await rotaLote(req, url);

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
  // Reprocessamento manual pode pedir lote maior; teto de 6 cabe no limite do gateway.
  let batchSize = 3;
  try {
    const body = await req.json();
    if (Number.isInteger(body?.limit)) batchSize = Math.min(Math.max(body.limit, 1), 6);
  } catch { /* cron manda {} */ }
  const { data: picks, error } = await supabase.rpc('ai_pick_deals', { p_limit: batchSize });
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
      const msg = String((e as Error).message);
      // Falha do PROVEDOR (sem credito, limite, fora do ar, tempo esgotado) nao e
      // culpa da conversa: ela continua na fila. Em 28/09/2026 o credito da
      // OpenAI acabou e, marcando como analisada, um dia inteiro de conversas
      // dos clientes saiu da fila sem analise nenhuma.
      if (/^openai (429|5\d\d)/.test(msg) || /abort|timed? ?out/i.test(msg)) {
        return { deal: p.deal_id, error: msg.slice(0, 200), fica_na_fila: true };
      }
      // Falha da propria conversa: marca o estado pra nao re-tentar em loop
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
