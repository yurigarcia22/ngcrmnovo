import OpenAI from "openai";
import { buildSystemPrompt, AGENT_TOOLS, type AgentContext } from "./agent-prompt";
import type { AgentToolCall, AgentDecision } from "./agent-types";

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
// gpt-4o-mini: rapido, barato, function calling robusto.
// tool_choice: "required" garante que sempre vai chamar pelo menos uma tool.
const OPENAI_MODEL = "gpt-4o-mini";

// Converte tools do formato Gemini pro formato OpenAI
const OPENAI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] =
  AGENT_TOOLS[0].functionDeclarations.map((fn: any) => ({
    type: "function",
    function: {
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    },
  }));

export async function runAgent(ctx: AgentContext): Promise<AgentDecision> {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY nao configurada");
  }

  const client = new OpenAI({ apiKey: OPENAI_KEY });
  const systemPrompt = buildSystemPrompt(ctx);

  const lastInbound = [...ctx.conversationHistory]
    .reverse()
    .find((m) => m.direction === "inbound");
  const trigger = lastInbound
    ? `Ultima mensagem do lead: "${lastInbound.content}"\n\nResponda agora usando as tools.`
    : `Nenhuma mensagem do lead ainda. Inicie a conversa apropriada com base no contexto.`;

  const result = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: trigger },
    ],
    tools: OPENAI_TOOLS,
    // FORCA o modelo a chamar pelo menos uma tool — elimina silencio
    tool_choice: "required",
    temperature: 0.7,
  });

  const message = result.choices[0]?.message;
  const calls: AgentToolCall[] = [];

  for (const tc of message?.tool_calls ?? []) {
    if (tc.type === "function") {
      try {
        const args = JSON.parse(tc.function.arguments);
        calls.push({ name: tc.function.name, args } as AgentToolCall);
      } catch (e: any) {
        console.warn(
          "[openai-agent] erro parsing args:",
          tc.function.arguments,
          e?.message,
        );
      }
    }
  }

  return {
    toolCalls: calls,
    rawResponse: result,
    reasoning: message?.content ?? undefined,
  };
}

/**
 * Retry forçando a chamada de send_message especificamente.
 * Usado quando o agente principal chamou outras tools (update_lead_status,
 * collect_responsible_info, etc) mas esqueceu o send_message.
 */
export async function runAgentForceMessage(ctx: AgentContext): Promise<AgentDecision> {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY nao configurada");
  }

  const client = new OpenAI({ apiKey: OPENAI_KEY });
  const systemPrompt = buildSystemPrompt(ctx);

  const lastInbound = [...ctx.conversationHistory]
    .reverse()
    .find((m) => m.direction === "inbound");
  const trigger = lastInbound
    ? `Ultima mensagem do lead: "${lastInbound.content}"\n\nVoce deve gerar APENAS o texto da resposta usando send_message. Nao chame outras tools agora.`
    : `Inicie a conversa com uma mensagem apropriada usando send_message.`;

  const result = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: trigger },
    ],
    tools: OPENAI_TOOLS,
    // FORCA send_message especificamente — nao da escolha
    tool_choice: { type: "function", function: { name: "send_message" } },
    temperature: 0.7,
  });

  const message = result.choices[0]?.message;
  const calls: AgentToolCall[] = [];

  for (const tc of message?.tool_calls ?? []) {
    if (tc.type === "function") {
      try {
        const args = JSON.parse(tc.function.arguments);
        calls.push({ name: tc.function.name, args } as AgentToolCall);
      } catch (e: any) {
        console.warn("[openai-agent force] erro parsing args:", tc.function.arguments, e?.message);
      }
    }
  }

  return {
    toolCalls: calls,
    rawResponse: result,
    reasoning: message?.content ?? undefined,
  };
}
