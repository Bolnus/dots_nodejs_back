import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { LLM_API_KEY, LLM_MODEL, LLM_OPENAI_BASE_URL, LLM_OPTIONS } from "./config.js";
import type { LlmContextMessage, LlmToolCallResult } from "./llmTypes.js";

const CHAT_TIMEOUT_MS = 120_000;

const client = new OpenAI({
  apiKey: LLM_API_KEY,
  baseURL: LLM_OPENAI_BASE_URL,
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

/** Requests a tool call from the LLM; throws when no tool call is returned. */
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

  const message = completion.choices[0]?.message;
  const toolCall = message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Llm did not return a tool call");
  }

  return {
    toolName: toolCall.function.name,
    argumentsJson: toolCall.function.arguments,
    assistantContent: message.content?.trim() ?? null
  };
}
