# Product

## Register

product

## Users

Vendedores e closers brasileiros (Grupo NG e clientes white-label como a Sigma) operando
o dia inteiro dentro do CRM: atendem WhatsApp, movem leads no kanban, fazem cold-call
com fone no ouvido, disparam campanhas e cobram follow-up. Uso intenso em desktop,
consulta ocasional em celular. Contexto de pressa: entre uma ligação e outra, com o
lead esperando resposta. Há também a vertical de clínica veterinária (módulo `veterinaria`),
onde recepcionistas gerenciam pets, vacinas e agenda.

## Product Purpose

CRM de vendas nativo de WhatsApp (Evolution API): centraliza conversas, pipeline kanban,
prospecção ativa (cold-call), disparos em massa, metas e agenda num único lugar, multi-tenant.
Sucesso = o vendedor não perder nenhuma conversa nem follow-up, e o dono enxergar o funil
inteiro (canais, metas, reuniões) sem planilha.

## Brand Personality

Direto, humano, operacional. Fala como gente de vendas brasileira (informal, sem corporativês),
mas a interface é sóbria e densa na medida — ferramenta de trabalho, não vitrine.
3 palavras: claro, rápido, confiável.

## Anti-references

- CRM genérico "dashboard SaaS de template": grids de KPI-cards idênticos, gradientes,
  glassmorphism, dark mode decorativo (o dashboard navy legado é dívida, não referência).
- Cara de IA: eyebrows uppercase em toda seção, side-stripes coloridas, texto cinza claro
  ilegível, frases de efeito vazias.
- Ferramentas que escondem ação atrás de menus: aqui ação principal fica a 1 clique.

## Design Principles

1. **A conversa é o centro** — tudo converge pro atendimento; nenhum lead sem resposta pode
   passar despercebido.
2. **Um clique para agir** — registrar contato, mover etapa, agendar follow-up: ações de
   vendedor não abrem cerimônia.
3. **Densidade com hierarquia** — muita informação por tela, mas com 1 coisa primária clara;
   peso e tamanho, não caixa-alta.
4. **Estado real, sempre** — números do dashboard batem com o banco; status de conexão é o
   status de verdade; otimista na UI, honesto no dado.
5. **Claro > bonito** — contraste AA, rótulos em pt-BR direto, erro explica o que fazer.

## Accessibility & Inclusion

WCAG AA como piso (contraste 4.5:1 corpo, 3:1 large; alvos ≥44px; modais com focus-trap via
Radix Dialog; `aria-label` em botão só-ícone). Uso real inclui telas menores e mouse+teclado;
`prefers-reduced-motion` respeitado em toda animação. Ver DESIGN.md para o contrato visual.
