export type LlmChatRole = "user" | "assistant" | "system";

export type LlmContextMessage = {
  role: LlmChatRole;
  content: string;
};

/** Result of an LLM tool-calling completion. */
export type LlmToolCallResult = Readonly<{
  toolName: string | null;
  argumentsJson: string | null;
  assistantContent: string | null;
  hasToolCall: boolean;
}>;
