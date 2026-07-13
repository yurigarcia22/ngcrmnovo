# Módulo Prospecção Inteligente — Fase A (Camada de Pesquisa/Dossiê)

Primeira fatia do novo sistema de prospecção, construída DENTRO do CRM, ao lado do
webinar/disparos (sem desligar nada). Esta fase entrega a camada que o CRM não tinha:
pesquisar a empresa e gerar um dossiê com observações reais antes de abordar.

## O que foi construído

| Arquivo | O que é |
|---|---|
| `supabase/migrations/20260713000000_prospeccao_module.sql` | Tabela `prospeccao_leads` (tenant-scoped, RLS) |
| `frontend/lib/prospeccao/enrich.ts` | Motor: consulta CNPJ (BrasilAPI), lê o site, gera o dossiê via OpenAI |
| `frontend/app/(protected)/prospeccao/actions.ts` | Server actions: adicionar, importar, pesquisar, editar mensagem, aprovar, excluir |
| `frontend/app/(protected)/prospeccao/page.tsx` + `ProspeccaoClient.tsx` | Tela do módulo (fila, dossiê, aprovação) no design do CRM |
| `frontend/lib/modules.ts` | Módulo `prospeccao` registrado |
| `frontend/components/Sidebar.tsx` | Item "Prospecção" na navegação |

O que o dossiê traz por lead: 3 observações concretas, dor provável, gancho, insight
pra dar de graça, e a primeira mensagem (editável antes de aprovar). O prompt proíbe
inventar dado, então a IA só fala do que existe na ficha.

## Passos pra ativar (do seu lado)

1. **Aplicar a migration** no Supabase do CRM (roda a `20260713000000_prospeccao_module.sql`).
2. **Setar a variável de ambiente** no ambiente do CRM (Easypanel):
   - `OPENAI_API_KEY` = a chave da OpenAI (a mesma que você me passou; lembre de rotacionar a que vazou no chat).
   - Opcional: `PROSPECT_OPENAI_MODEL` = `gpt-4o` (default). Como o volume é baixo e direcionado, dá pra usar o modelo bom sem preocupação de custo.
3. **Ligar o módulo pro seu tenant**: no painel `/admin`, ativar o módulo "Prospeccao Inteligente" para o Grupo NG (ou setar `enabled=true` em `tenant_modules` para `module_key='prospeccao'`).
4. **Deploy**: push pra `main` (o Easypanel builda a pasta `/frontend`).

## Como testar

1. Abrir "Prospecção" na sidebar → "Adicionar leads".
2. Adicionar uma empresa real com CNPJ e/ou site (ex: uma confecção com site).
3. Clicar "Pesquisar". Em alguns segundos o status vira "Dossiê pronto".
4. "Ver dossiê": conferir as 3 observações, a dor, o insight e a mensagem. Editar a mensagem se quiser e "Aprovar pra abordagem".

## Checagem técnica

- `npx tsc --noEmit`: os arquivos deste módulo compilam sem erro (os 5 erros restantes do repo são pré-existentes, em `deals`, `emails`, `cold-leads` e `webinar/agent-executor.ts`, não relacionados a esta fase).
- Isolamento de tenant: toda action começa com `assertProspeccao()` e filtra `.eq('tenant_id', tenantId)`; a tabela tem RLS por `current_tenant_id()`.
- Sem travessão em nenhum texto (convenção do CRM respeitada).

## Próximas fases (já acordadas)

- **Fase B — Cérebro estável**: o lead aprovado aqui alimenta o agente conversacional; trocar o modelo, corrigir os loops e unificar o webhook duplicado que fazia o agente do webinar bugar.
- **Fase C — Dashboard**: funil de prospecção (fila → dossiê → aprovado → abordado → respondido → reunião) com conversão por gancho.
- **Fase D — Corte**: aposentar o webinar antigo quando o novo estiver validado.
