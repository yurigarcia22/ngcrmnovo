export type AgentToolCall =
  | { name: "send_message"; args: { text: string } }
  | { name: "update_lead_status"; args: { new_status: string } }
  | {
      name: "collect_responsible_info";
      args: { name: string; email?: string; phone?: string };
    }
  | {
      name: "schedule_followup";
      args: { hours_from_now: number; content: string };
    }
  | { name: "escalate_to_human"; args: { reason: string } }
  | { name: "mark_as_lost"; args: { reason: string } };

export type AgentDecision = {
  toolCalls: AgentToolCall[];
  rawResponse: any;
  reasoning?: string;
};
