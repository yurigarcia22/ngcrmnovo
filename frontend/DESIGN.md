# DESIGN.md — CRM NG (sistema de design)

Contrato visual do produto. Toda tela/componente deve seguir isto. O register é
**product** (a UI serve o produto; clareza e densidade apropriada vencem).

## Identidade

- **Light, sempre.** Nada de telas dark isoladas (o dashboard navy de vendas e o
  WonLeadsModal dark são dívida; novas telas e refações são claras).
- **Tinta (texto):** `slate-800` títulos, `slate-700` corpo, `slate-500` secundário.
  NUNCA `gray-400`/`slate-400` para texto que precisa ser lido.
- **Superfície:** `white` cartões, `slate-50`/`#f7f8fa` fundo de página, borda `slate-200`.
- **Accent (vendas):** `indigo-600`. **Accent (clínica veterinária):** `teal-600`
  (aplicado via `.theme-vet` em globals.css, que remapeia indigo→teal). Use as
  classes indigo/blue normalmente; o tema cuida da troca no contexto vet.
- **Cores semânticas (iguais em todo o app):** `emerald` = sucesso/atendido/em dia ·
  `amber` = atenção/vencendo · `rose` = erro/perdido/vencida · `sky` = agendado/info.

## Banimentos (match-and-refuse — reescreva a estrutura)

1. **Side-stripe border** — `border-left`/`border-right` > 1px colorida como acento
   em card/item/alerta. Use borda completa, fundo tingido, dot, ícone ou nada.
2. **Eyebrow uppercase tracked como padrão** — `text-[10px] uppercase tracking-wider`
   acima de toda seção/label é o tique nº1 de IA. Hierarquia por **peso e tamanho**
   (`text-sm font-semibold`), não caixa-alta espaçada. (Um badge pontual é ok.)
3. **Cinza-sobre-cor** — texto cinza sobre fundo colorido fica lavado. Use um tom
   mais escuro da própria cor (ex: `text-teal-700` em `bg-teal-50`) ou branco.
4. **Hero-metric template / grids de cards idênticos** — número gigante + label +
   ícone em pílula, repetido em 4-6 cards iguais. Use faixa de stats com divisores,
   hierarquia (1 métrica primária), ou listas. Nunca duplicar o mesmo bloco de KPI.
5. **Glassmorphism decorativo** — `backdrop-blur` em card/modal sem motivo. Superfície
   sólida. Blur só quando material e raro.
6. **Gradient text** (`bg-clip-text`). Cor sólida; ênfase por peso/tamanho.
7. **Nested cards** — card dentro de card. Use separadores/seções.
8. **Hex hardcoded** novo (`#0f172a`, `#2b3d51`, `#0ea5e9`...). Use a escala Tailwind
   (slate/indigo/teal/emerald/amber/rose) para o tema funcionar.

## Acessibilidade (não-negociável)

- **Contraste** ≥ 4.5:1 corpo, ≥ 3:1 large. Placeholder também 4.5:1.
- **Modais:** usar SEMPRE o `Dialog` de `components/ui/dialog.tsx` (Radix: focus trap,
  Esc, `role="dialog"`, retorno de foco). NÃO criar `div fixed inset-0` manual.
- **Itens clicáveis** são `<button>`/`<Link>`, não `<div onClick>`. `aria-label` em
  botões só-ícone. `aria-current` no nav ativo.
- **Alvos de toque** ≥ 44×44px (mín. `p-2.5` / `h-9 w-9`). O uso real é mobile/tablet.
- Selects/inputs com `<label>` associado ou `aria-label`.

## Layout & motion

- Cards são a resposta preguiçosa; use quando forem mesmo a melhor opção. Varie ritmo
  de espaçamento. Flex para 1D, Grid para 2D.
- Motion: ease-out (quart/expo), sem bounce/elastic. Sempre com
  `@media (prefers-reduced-motion: reduce)`. Stagger em lista é ok.
- `router.refresh()` / update otimista — nunca `window.location.reload()` como UX.

## Referências boas (replicar, são a fonte da verdade)

- `app/(protected)/meu-dia/MeuDiaClient.tsx` — tom humano, hierarquia, empty states.
- `app/(protected)/dashboard/components/VetDashboard.tsx` — faixa de stats com
  divisores (não card-grid), timeline, skeletons, motion correto.
- `app/(protected)/leads/page.tsx` — paleta slate coesa, kanban limpo.
