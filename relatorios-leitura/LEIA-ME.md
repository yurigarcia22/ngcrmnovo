# Acesso de leitura ao CRM NG (conferência de relatórios)

Esta pasta dá acesso **só de leitura** ao banco do CRM NG, pra conferir relatórios de clientes com base nas
conversas de WhatsApp que a Evolution grava no CRM. Vale pra todas as clínicas.

## Como consultar

```bash
python crm_leitura.py --tabela "select name from tenants order by name"
python crm_leitura.py "select ..."          # sai em JSON
```

Em Python: `from crm_leitura import consulta` e `consulta("select ...")` devolve uma lista de dicionários.

- Só `SELECT`. Qualquer escrita é recusada pelo banco.
- Cada consulta tem limite de 30 segundos. Prefira agregar no SQL (`count`, `group by`) em vez de puxar tudo.
- O token fica no arquivo `.token` desta pasta e vence em 18/04/2027. Nunca colar em chat, documento ou commit.

## Regras

- São dados pessoais de pacientes e tutores (LGPD). No relatório para o cliente, use números e trechos curtos;
  não copie conversas inteiras pra fora do banco.
- Não tente ler o que está bloqueado (senhas, tokens, login, payload bruto de webhook). O bloqueio é proposital.

## Fuso horário

`created_at` e as outras datas estão em **UTC**. Pra contar por dia da clínica, converta:
`(created_at at time zone 'America/Sao_Paulo')::date`. A Vitta Pata fica em Cuiabá: use `'America/Cuiaba'`.

## Clínicas (tenants)

| Clínica | tenant_id |
|---|---|
| Dr. Yasmin | `51b44d8a-4596-42bd-8f59-6a6a356fe8a7` |
| Cães e Cia | `e0743a8a-366a-46f9-8963-69e518802ea3` |
| Animal Care | `d725460b-e4cc-4994-bf46-d68f57c73615` |
| Vitta Pata | `2af6c8f8-d008-4f1c-bd5e-ba09bda9276e` |
| GRUPO NG (a agência) | `00000000-0000-0000-0000-000000000000` |

(Também existem GRUPO TESTE, Sigma e Zênite Connect, que não são clínicas ativas no CRM.)

## Tabelas principais

| Tabela | O que é | Colunas que importam |
|---|---|---|
| `messages` | cada mensagem de WhatsApp | `tenant_id`, `deal_id`, `contact_id`, `direction` (`inbound` = cliente, `outbound` = clínica), `type` (`text`, `image`, `audio`, `video`, `pdf`, `document`, `location`), `content`, `transcription` (áudio transcrito), `media_url`, `created_at`, `instance_name` |
| `deals` | o card da conversa no funil | `tenant_id`, `contact_id`, `stage_id`, `status` (`open`/`won`/`lost`), `value`, `owner_id`, `created_at`, `closed_at`, `origin` (`meta_ads`, `organico`...), `origin_detail` (do anúncio: `sourceId` = id do anúncio, `title`, `mediaType` 1 imagem / 2 vídeo), `meta_lead_id`, `ctwa_clid`, `lost_reason_id`, `acquisition_channel_id` |
| `contacts` | o contato | `tenant_id`, `name`, `phone`, `created_at` |
| `stages` / `pipelines` | etapas e funis | `stages.name`, `position`, `is_inbox`, `is_won`, `is_lost`, `pipeline_id` |
| `deal_ai_state` | o que a IA concluiu de cada conversa | `first_contact_at` (1º contato), `contact_classification` (`NEW_LEAD`, `EXISTING_PATIENT`, `NON_COMMERCIAL`), `funnel_stage`, `intent_score` (0 a 100), `service_interest`, `waiting_on` (`BUSINESS` = clínica deve resposta), `waiting_since`, `appointment_confirmed_at`, `summary`, `lost_suggestion`, `origin_guess` |
| `crm_events` | linha do tempo (IA moveu card, origem detectada, agendamento confirmado) | `event_type`, `previous_value`, `new_value`, `source`, `created_at` |
| `tasks` | tarefas e follow-ups | `deal_id`, `title`, `due_date`, `is_completed`, `completed_at` |
| `meta_capi_events` | eventos devolvidos pra Meta (lead, qualificado, reunião) | `event_name`, `status`, `event_time`, `sent_at` |
| `tags` / `deal_tags` | etiquetas | `tags.name`, `deal_tags.deal_id` |
| `acquisition_channels`, `loss_reasons`, `products`, `deal_items`, `notes`, `appointments`, `ai_analysis`, `dispatch_campaigns`, `dispatch_recipients`, `hist_archive`, `pets`, `pet_vaccines` | apoio | |
| `tenants` | só `id, name, slug, is_active, plan, created_at` | |
| `profiles` | atendentes; sem `select *`, liste as colunas: `id, full_name, role, tenant_id, is_active` | |
| `whatsapp_instances` | sem `select *`, liste as colunas: `instance_name, status, tenant_id, phone_number, custom_name` | |

Regra de "lead novo" usada no CRM: 1º contato (`deal_ai_state.first_contact_at`) dentro do período **e**
`contact_classification` diferente de `EXISTING_PATIENT` e `NON_COMMERCIAL`.

Atenção: de 10/10/2026 a 20/10/2026 o CRM não salvou o arquivo de **imagens e vídeos** recebidos (a mensagem
existe, com `media_url` vazio e o aviso "[Imagem não salva]" / "[Vídeo não salvo]").

## Exemplos

Mensagens por dia de uma clínica, separando cliente e clínica:

```sql
select (m.created_at at time zone 'America/Sao_Paulo')::date dia,
       count(*) filter (where m.direction = 'inbound') do_cliente,
       count(*) filter (where m.direction = 'outbound') da_clinica
from messages m
where m.tenant_id = '51b44d8a-4596-42bd-8f59-6a6a356fe8a7'
  and m.created_at >= now() - interval '7 days'
group by 1 order by 1
```

Leads novos por dia (mesma regra da tela Inteligência):

```sql
select (s.first_contact_at at time zone 'America/Sao_Paulo')::date dia, count(*) leads_novos
from deal_ai_state s
where s.tenant_id = '51b44d8a-4596-42bd-8f59-6a6a356fe8a7'
  and s.first_contact_at >= now() - interval '30 days'
  and coalesce(s.contact_classification, '') not in ('EXISTING_PATIENT', 'NON_COMMERCIAL')
group by 1 order by 1
```

Leads por origem e por anúncio da Meta:

```sql
select coalesce(d.origin, 'nao identificada') origem, d.origin_detail->>'title' anuncio,
       case d.origin_detail->>'mediaType' when '1' then 'imagem' when '2' then 'video' end formato,
       count(*) cards
from deals d
where d.tenant_id = '51b44d8a-4596-42bd-8f59-6a6a356fe8a7'
  and d.created_at >= now() - interval '30 days'
group by 1, 2, 3 order by 4 desc
```

Tempo da primeira resposta da clínica em cada conversa nova (mediana em minutos). Atenção: a mensagem
automática de saudação do WhatsApp Business conta como resposta e puxa o tempo pra perto de zero; pra medir
atendimento humano, ignore as respostas enviadas no mesmo minuto da chegada ou filtre o texto da saudação:

```sql
with primeira as (
  select m.deal_id,
         min(m.created_at) filter (where m.direction = 'inbound') chegou,
         min(m.created_at) filter (where m.direction = 'outbound') respondeu
  from messages m
  where m.tenant_id = 'e0743a8a-366a-46f9-8963-69e518802ea3'
    and m.created_at >= now() - interval '7 days'
  group by 1
)
select count(*) conversas,
       round(percentile_cont(0.5) within group (order by extract(epoch from respondeu - chegou) / 60)::numeric, 1) mediana_min
from primeira where respondeu > chegou
```

Conversas esperando resposta da clínica agora:

```sql
select c.name, s.waiting_since, left(s.summary, 120) resumo
from deal_ai_state s join deals d on d.id = s.deal_id join contacts c on c.id = d.contact_id
where s.tenant_id = 'd725460b-e4cc-4994-bf46-d68f57c73615' and s.waiting_on = 'BUSINESS' and d.status = 'open'
order by s.waiting_since
```

Agendamentos confirmados no período (pela data da confirmação):

```sql
select (s.appointment_confirmed_at at time zone 'America/Sao_Paulo')::date dia, count(*) agendamentos
from deal_ai_state s
where s.tenant_id = '2af6c8f8-d008-4f1c-bd5e-ba09bda9276e'
  and s.appointment_confirmed_at >= now() - interval '30 days'
group by 1 order by 1
```
