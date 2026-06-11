import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { LLM_API_KEY, LLM_HOST, LLM_MODEL, LLM_OPTIONS } from "./config.js";
import type { LlmContextMessage, LlmToolCallResult } from "./llmTypes.js";

const CHAT_TIMEOUT_MS = 120_000;

const client = new OpenAI({
  apiKey: LLM_API_KEY,
  baseURL: LLM_HOST,
  timeout: CHAT_TIMEOUT_MS
});

/** Creates a unique per-chat thread id stored in the database. */
export function createLlmChatThreadId(): string {
  return randomUUID();
}

/** Sends a chat completion request to Ollama using an OpenAI-compatible API. */
export async function chatWithLlmMessages(messages: LlmContextMessage[]): Promise<string> {
  const completion = await client.chat.completions.create({
    model: LLM_MODEL,
    messages,
    temperature: LLM_OPTIONS.temperature,
    top_p: LLM_OPTIONS.top_p
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (content === undefined || content === "") {
    throw new Error("Llm returned an empty reply");
  }
  return content;
}

/** Convenience wrapper for a single-user-message completion. */
export async function chatWithLlm(userText: string): Promise<string> {
  return chatWithLlmMessages([{ role: "user", content: userText }]);
}

/** Maps an OpenAI completion message to the wire tool-call result shape. */
function mapCompletionToToolResult(message: OpenAI.Chat.ChatCompletionMessage | undefined): LlmToolCallResult {
  const assistantContent = message?.content?.trim() ?? null;
  const toolCall = message?.tool_calls?.[0];
  console.log("toolCall", JSON.stringify(toolCall, null, 2));

  if (!toolCall || toolCall.type !== "function") {
    return {
      toolName: null,
      argumentsJson: null,
      assistantContent,
      hasToolCall: false
    };
  }

  return {
    toolName: toolCall.function.name,
    argumentsJson: toolCall.function.arguments,
    assistantContent,
    hasToolCall: true
  };
}

/** Requests a tool call from the LLM and returns the mapped completion result. */
export async function chatWithLlmTools(
  messages: LlmContextMessage[],
  tools: OpenAI.Chat.ChatCompletionTool[]
): Promise<LlmToolCallResult> {
  const completion = await client.chat.completions.create({
    model: LLM_MODEL,
    messages,
    tools,
    tool_choice: "required",
    temperature: LLM_OPTIONS.temperature,
    top_p: LLM_OPTIONS.top_p
  });

  return mapCompletionToToolResult(completion.choices[0]?.message);
}
