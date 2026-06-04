export type LlmChatRole = "user" | "assistant" | "system";

export type LlmContextMessage = {
  role: LlmChatRole;
  content: string;
};
