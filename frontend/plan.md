# CRM Evolution - Vibecoding Plan

## Tarefa Atual: Campos Personalizados (`/settings/fields`)
Permitir que a empresa crie campos customizados para seus Deals.

1.  **Backend (`app/settings/fields/actions.ts`):**
    - `getFields()`: Listar definições ordenadas por posição.
    - `saveField(field)`: Criar ou atualizar definição (label, type, options, show_in_card).
    - `deleteField(id)`: Remover definição.

2.  **Frontend Config (`app/settings/fields/page.tsx`):**
    - Lista de campos existentes.
    - Modal/Formulário para adicionar novo:
        - Nome do Campo.
        - Tipo (Texto, Número, Data, Seleção).
        - Se for Seleção: Input para adicionar opções (tags).
        - Checkbox: "Mostrar no Card do Kanban?".

3.  **Frontend Uso (`components/DealModal.tsx`):**
    - Buscar a lista de definições de campos.
    - Renderizar dinamicamente os inputs baseados no `type`.
    - Ao salvar o Deal, gravar os dados no JSON `custom_values`.

4.  **Visualização (`components/KanbanCard.tsx`):**
    - Ler `deal.custom_values`.
    - Buscar definições onde `show_in_card === true`.
    - Renderizar esses valores dentro do card (estilo Kommo: texto pequeno cinza ou tags).