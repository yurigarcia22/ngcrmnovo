# CRM Evolution - Vibecoding Plan

## Contexto
CRM funcional com Tags implementadas.
Agora precisamos filtrar o Kanban para encontrar leads específicos rapidamente.

## Tarefa Atual: Filtros Avançados no Kanban
Adicionar controles de filtragem no topo da página `/leads`.

1.  **Componente (`components/kanban/FilterBar.tsx`):**
    - Criar uma barra contendo:
        - O Input de Busca (Texto) que já existe.
        - Dropdown "Etiquetas": Lista as tags do banco. Permite múltipla seleção ou única.
        - Dropdown "Data": "Todo o período", "Hoje", "Últimos 7 dias", "Este Mês".
    - Botão "Limpar Filtros" (só aparece se tiver filtro ativo).

2.  **Lógica de Filtragem (`app/leads/page.tsx`):**
    - Elevar o estado dos filtros (search, selectedTag, dateRange).
    - Aplicar a lógica combinada no array `deals`:
        - `deal` deve ter o texto da busca.
        - `deal` deve ter a tag selecionada (se houver).
        - `deal.created_at` deve estar dentro do período.