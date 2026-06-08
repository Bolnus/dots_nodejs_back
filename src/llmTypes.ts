export type LlmChatRole = "user" | "assistant" | "system";

export type LlmContextMessage = {
  role: LlmChatRole;
  content: string;
};

/** Result of an LLM completion that invoked a tool. */
export type LlmToolCallResult = Readonly<{
  toolName: string;
  argumentsJson: string;
  assistantContent: string | null;
}>;
