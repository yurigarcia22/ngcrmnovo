# Módulo IA Inteligência — Plano de Implementação

> Adaptação do plano conceitual `crm_inteligente_whatsapp_clinicas_mvp.md` (GPT) para a
> estrutura REAL do CRM NG. O documento original assume construção do zero sobre a API
> oficial da Meta; nós já temos 70% da fundação construída e a fonte de dados é a
> **Evolution API**, que já grava as conversas dos dois lados no banco.

**Regra inegociável: a IA NUNCA envia mensagem a lead. Não existe caminho de envio no motor.**

---

## 1. O que o plano do GPT pede vs o que o CRM JÁ TEM

| Plano GPT (seção) | Situação no CRM NG |
|---|---|
| Multi-tenant + RLS (§8.1, §32) | ✅ `tenants` + RLS por `current_tenant_id()` em tudo |
| Tabela `contacts` (§8.2) | ✅ `contacts` (com `wa_lid`, foto, unique por tenant+phone) |
| Tabela `chats` (§8.3) | ✅ equivalente: `deals` — 1 conversa aberta por contato |
| Tabela `messages` idempotente (§8.4, §27) | ✅ `messages` com `direction` in/outbound + `evolution_message_id` (= wamid) |
| Webhook salva-primeiro + fila (§26, §49.1) | ✅ Edge Function v45 ingest-first + caixa-preta `webhook_events` + crons de retry |
| Captura outbound (echoes §4) | ✅ a Evolution entrega o que a clínica envia pelo celular (`fromMe`) |
| Histórico inicial (§29) | ✅ sync de histórico da Evolution (com suporte a LID) |
| Funil com estados (§9) | ✅ `pipelines`/`stages` (is_inbox/is_won/is_lost) por tenant |
| Jobs/cron (§26) | ✅ padrão `pg_cron` → `/api/cron/*` (6 crons rodando) |
| Motivos de perda (§10 LOST_*) | ✅ `loss_reasons` + modal obrigatório |
| Oportunidade ≠ telefone eterno (§7) | ✅ parcial: deal fecha e reabre (`resolved_at`); episódios ficam pra v2 |

**Conclusão: Fases "Captura" (§45.1) já está PRONTA.** Começamos direto na Fase Inteligência.

### Diferenças estruturais (decisões tomadas)

1. **Fonte = Evolution, não coexistência Meta.** O motor lê `messages` do banco; não há webhook novo.
   A coexistência oficial (NG Send) segue como evolução futura — o motor não muda, só a fonte.
2. **`deals` É a oportunidade.** Não criamos tabela `opportunities` paralela — o estado IA vive
   em tabela 1:1 (`deal_ai_state`) para não poluir `deals`.
3. **Episódios (§7.4): fora do MVP.** O ciclo abrir→fechar→reabrir do deal cobre o essencial.
4. **Identificação de atendente (§5): fora do MVP**, como o próprio doc recomenda.

---

## 2. Os dois submódulos (pedido do Yuri)

### Submódulo A — OBSERVADOR (`mode = 'observer'`)
A IA analisa as conversas e **só escreve na página Inteligência**. Não toca no funil.
É o modo default e o único ativado no rollout inicial.

### Submódulo B — PILOTO (`mode = 'pilot'`)
Tudo do observador **+** move o card no funil de vendas e preenche dados do deal
(serviço de interesse, resumo, score). Guard-rails duros (seção 6).

O modo é escolhido **por tenant** em Configurações → IA Inteligência. Kill-switch imediato
(`enabled = false`) sempre visível.

---

## 3. Banco de dados (migration nova)

```sql
-- Config por tenant
ai_settings (
  tenant_id uuid pk/fk,
  enabled boolean default false,
  mode text check in ('observer','pilot') default 'observer',
  vertical text check in ('veterinary','dentistry','generic'),
  services jsonb,               -- catálogo (taxonomias §15/§17 como default por vertical)
  analyze_from timestamptz,     -- corte: não analisar conversas antigas (§29)
  model text default 'gpt-5-mini',
  min_confidence_move numeric default 0.85,   -- §38
  business_hours jsonb, sla_first_response_min int default 10
)

-- Estado CORRENTE por deal (1:1, atualizável)
deal_ai_state (
  deal_id uuid pk/fk, tenant_id,
  funnel_stage text,            -- enum fechado do §9 (NEW_LEAD..COMPLETED)
  intent_score int,             -- 0-100 (§12)
  service_interest text[],
  waiting_on text,              -- CUSTOMER|BUSINESS|NONE|UNKNOWN + waiting_since (backend, §22)
  waiting_since timestamptz,
  appointment jsonb,            -- {requested,offered,confirmed}
  price jsonb,                  -- {requested,provided,objection}
  extracted jsonb,              -- pet/sintomas/procedimento etc (§16/§18) — NUNCA diagnóstico
  summary text, next_action text,
  lost_suggestion jsonb,        -- IA SUGERE perda; nunca executa (ver guard-rails)
  confidence numeric,
  last_analyzed_message_at timestamptz, needs_analysis boolean
)

-- Histórico IMUTÁVEL de análises (§8.7, §34) — nunca sobrescrever
ai_analysis (
  id, tenant_id, deal_id,
  prompt_version text, model text,
  messages_from timestamptz, messages_to timestamptz,
  structured_output jsonb, summary text, confidence numeric,
  input_tokens int, output_tokens int, cost_estimate numeric,
  created_at
)

-- Timeline de eventos auditável (§8.8)
crm_events (
  id, tenant_id, deal_id,
  event_type text,              -- lead_detected, price_requested, appointment_confirmed,
                                -- stage_moved_by_ai, ai_suggested_lost, ...
  previous_value text, new_value text,
  source text check in ('ai','human','system'),
  confidence numeric,
  evidence_message_ids uuid[],  -- §37: toda conclusão aponta pras mensagens
  created_at
)

-- Mapeamento estado IA -> etapa real do funil (por pipeline; usado no modo piloto)
ai_stage_mapping (
  tenant_id, pipeline_id, ai_stage text, stage_id bigint,
  unique (pipeline_id, ai_stage)
)
```

---

## 4. Motor de análise

**Endpoint:** `/api/cron/ai-analyze` (padrão dos crons existentes), pg_cron a cada 2 min.

**Seleção (debounce por blocos, §6):** deals com mensagem nova após `last_analyzed_message_at`
**e** sem mensagem há ≥ 90s **e** `created_at/last msg > analyze_from` **e** tenant `enabled`.
Lote máx. 20 conversas/rodada (backpressure).

**Chamada:** OpenAI **Structured Outputs** (`response_format: json_schema, strict: true`) —
o schema do §21, versionado (`prompt_version = crm-core-v0.1`). Prompt = base do §20 +
bloco da vertical + `services` + estado atual + análises prévias + mensagens novas.

**PII (§32):** enviamos o texto das mensagens com rótulos `[CLIENTE]`/`[CLINICA]` — sem
telefone, sem nome do contato no prompt.

**Aplicação do resultado:**
1. grava `ai_analysis` (sempre);
2. atualiza `deal_ai_state` (merge incremental — nunca descartar fato confirmado, §regras);
3. gera `crm_events` para cada mudança relevante;
4. `waiting_since`/SLA calculados pelo **backend**, não pela IA (§22);
5. **se `mode='pilot'`**: aplica movimentação (seção 6).

**Custo estimado:** modelo mini ≈ R$ 0,01–0,03 por análise (conversa ~30 msgs).
Clínica com 100 conversas/dia ≈ **R$ 1–3/dia**. Registrado por análise em `ai_analysis`.

---

## 5. UI — módulo "Inteligência" (rota `/inteligencia`)

Página nova no menu (ícone ✨), 4 áreas (§24), tema claro seguindo `DESIGN.md`:

1. **Visão Geral** — conversas, novos leads, agendamentos, conversão, aguardando clínica /
   cliente, oportunidades perdidas (contadores do `deal_ai_state` + `crm_events`).
2. **Pipeline IA** — funil pelos estados do §9 (independente do funil manual; é a visão
   do observador mesmo sem mover nada).
3. **Conversas** — lista ordenável por intenção/última atividade; card: nome, serviço,
   score, estado, "aguardando X há N min". Filtros: estado, serviço, score mínimo.
4. **Detalhe** — conversa original + resumo IA + dados extraídos + timeline de eventos
   com **evidência clicável** (mensagem que sustenta cada conclusão, §37).

**Confiança na UI (§38):** ≥0.85 fato · 0.60–0.84 "provável" (badge) · <0.60 não exibe alerta.

Configuração em Settings → IA Inteligência: liga/desliga, modo, vertical, serviços,
data de corte, mapeamento de etapas (piloto).

---

## 6. Guard-rails do modo PILOTO

1. **Nunca envia mensagem** — o motor não importa nenhuma função de envio.
2. Move **apenas** deals `status='open'`; nunca toca em won/lost.
3. Move apenas com `confidence >= min_confidence_move` e mapeamento explícito da etapa.
4. **Nunca marca perda**: estados `LOST_*` viram `lost_suggestion` + evento
   `ai_suggested_lost` na página Inteligência; a perda continua humana (modal de motivo).
5. **Nunca marca ganho**: `SCHEDULED`/`COMPLETED` movem até a etapa mapeada; ganhar é humano.
6. Não regride etapa por padrão (configurável depois).
7. Todo movimento gera `crm_events` com `source='ai'` + evidências (auditável e reversível).
8. Humano moveu o card depois da IA? O motor respeita: só move de novo se o estado IA
   mudar DE NOVO após a última ação humana (comparando timestamps com `crm_events`).
9. Trigger anti cross-tenant do banco já blinda o stage (migration 20260901020000).

---

## 7. Fases de implementação

| Fase | Entrega | Depende de |
|---|---|---|
| **F1 — Fundação** | Migration (5 tabelas) + `OPENAI_API_KEY` no Easypanel + motor observador rodando (cron) + smoke test com conversas reais da Dra. Yasmin | nada |
| **F2 — Página Inteligência** | Rota `/inteligencia` completa (4 áreas) + settings do módulo | F1 |
| **F3 — Piloto** | `ai_stage_mapping` + UI de mapeamento + movimentação com guard-rails | F2 validada |
| **F4 — Radar** | Alertas §39 na Visão Geral (alta intenção aguardando clínica etc.) + Daily Intelligence (§54: resumo executivo diário por tenant) | F2 |
| **F5 — Validação** | 7–14 dias rodando; auditar ~100 conversas (IA vs humano, §35); ajustar prompt → v0.2; reprocessar (`reprocessConversation`) | F1–F2 |

O doc do GPT §44 ("o que NÃO construir") permanece válido: sem chatbot, sem follow-up
automático, sem ranking de atendente, sem diagnóstico clínico.

---

## 8. Rollout por cliente

| Cliente | Tenant | Vertical | Pré-requisito |
|---|---|---|---|
| Dra. Yasmin | ✅ existe, Evolution conectada | `dentistry` | nada — piloto nº 1 |
| Cães e Cia | criar tenant + conectar Evolution | `veterinary` | conexão do número |
| Animal Care (Dracena) | criar tenant + conectar | `veterinary` | conexão do número |
| Cliente 4 | criar tenant + conectar | definir | conexão do número |
| Cliente 5 | criar tenant + conectar | definir | conexão do número |

Todos começam em **observer**. Piloto só depois da F5 validar a precisão no observador.

---

## 9. Riscos e mitigações

- **Falso positivo em "oportunidade perdida"** → priorizar precision (§36); threshold alto; só sugestão.
- **Custo IA descontrolado** → lote máximo por rodada, custo gravado por análise, alerta se > R$ X/dia.
- **LGPD** → PII minimizada no prompt; dados ficam no Supabase (RLS); cláusula no contrato dos clientes.
- **Evolution instável** → o motor lê do banco: se a Evolution cair, a análise só atrasa, nada quebra.
- **Prompt regride** → `prompt_version` + `ai_analysis` imutável + reprocessamento comparável (§53).
