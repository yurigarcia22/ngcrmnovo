/**
 * Tipo de uma tarefa da agenda do lead.
 *
 * A tabela `tasks` nao tem coluna de tipo: cada tela grava a descricao
 * ("Reunião com o cliente", "Follow-up com o cliente", "Reunião de
 * Apresentação (Origem: Cold Call)"). O tipo sai dali. Antes o card e o painel
 * chamavam qualquer tarefa de "Reunião", inclusive follow-up.
 */
export type TaskKind = "reuniao" | "followup" | "tarefa";

export function taskKind(task: { description?: string | null } | null | undefined): TaskKind {
    const d = task?.description ?? "";
    if (/follow[\s-]?up/i.test(d)) return "followup";
    if (/reuni/i.test(d)) return "reuniao";
    return "tarefa";
}

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
    reuniao: "Reunião",
    followup: "Follow-up",
    tarefa: "Tarefa",
};
