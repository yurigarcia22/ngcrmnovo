import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildSystemPrompt, AGENT_TOOLS, type AgentContext } from "./agent-prompt";

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
// Flash é ~5x mais rápido que Pro (3-6s vs 15-30s) e é o modelo correto pra
// webhook síncrono — Evolution dá ~10s de timeout. Ignoramos env aqui porque
// o Easypanel pode estar com Pro setado e não queremos depender disso.
const GEMINI_MODEL = "gemini-2.5-flash";

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

/**
 * Chama Gemini com contexto + tools. Retorna lista de tool calls que o agente quer executar.
 */
export async function runAgent(ctx: AgentContext): Promise<AgentDecision> {
  if (!GEMINI_KEY) {
    throw new Error("GEMINI_API_KEY nao configurada");
  }

  const genAI = new GoogleGenerativeAI(GEMINI_KEY);

  const systemPrompt = buildSystemPrompt(ctx);

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: AGENT_TOOLS as any,
    systemInstruction: systemPrompt,
  });

  // Mensagem do usuario = ultima mensagem inbound (que esta no historico, mas damos enfase aqui)
  const lastInbound = [...ctx.conversationHistory]
    .reverse()
    .find((m) => m.direction === "inbound");
  const trigger = lastInbound
    ? `Ultima mensagem do lead: "${lastInbound.content}"\n\nResponda agora usando as tools.`
    : `Nenhuma mensagem do lead ainda. Inicie a conversa apropriada com base no contexto.`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: trigger }] }],
  });

  const response = result.response;
  const calls: AgentToolCall[] = [];

  const candidates = response.candidates ?? [];
  for (const cand of candidates) {
    for (const part of cand.content?.parts ?? []) {
      if ((part as any).functionCall) {
        const fc = (part as any).functionCall;
        calls.push({ name: fc.name, args: fc.args } as AgentToolCall);
      }
    }
  }

  let reasoning: string | undefined;
  for (const cand of candidates) {
    for (const part of cand.content?.parts ?? []) {
      if ((part as any).text) {
        reasoning = (reasoning ?? "") + (part as any).text;
      }
    }
  }

  return { toolCalls: calls, rawResponse: response, reasoning };
}
