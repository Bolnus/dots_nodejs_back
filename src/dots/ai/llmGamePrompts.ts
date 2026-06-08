import type { LlmContextMessage } from "../../llmTypes.js";
import type { LlmGameStatePayload } from "./llmGameTypes.js";

/** Builds the system prompt describing dots rules and tool usage for the LLM. */
export function buildLlmSystemPrompt(): string {
  return [
    "You are playing the game Dots (точки) as the AI opponent.",
    "Every response must include:",
    "1. Exactly one tool call — COMMIT_PLACEMENT, COMMIT_CAPTURE, or SURRENDER — to submit your move.",
    "2. A brief message (1–2 sentences) explaining why you chose that move.",
    "The tool call applies your move; the message is shown in chat. Text without a tool call does not count as a move.",
    "Rules:",
    "- Players alternate placing dots on empty grid intersections.",
    "- A capture encloses opponent dots: start on an empty cell, walk through adjacent own dots, close on the start.",
    "- Captured cells become blocked; enclosed opponent dots score for the capturer.",
    "- When the board is full, higher score wins.",
    "- Call SURRENDER if you cannot possibly win given the current scores and remaining playable cells.",
    "- Your goal is to capture opponent's dots.",
    "- If the opponent is about to capture your dots, try to protect them if possible.",
    "Always set `by` to your assigned player id (`yourPlayer` in the game state)."
  ].join("\n");
}

/** Builds a retry error when the LLM response omitted the required tool call. */
export function buildMissingToolCallError(assistantContent: string | null): string {
  const tools = "COMMIT_PLACEMENT, COMMIT_CAPTURE, or SURRENDER";
  const base =
    `Your previous response did not include a tool call, so your move was not applied. ` +
    `Every turn you must call exactly one tool (${tools}) to submit your move.`;

  if (assistantContent === null || assistantContent === "") {
    return `${base} You sent no tool call and no explanation. Call one of the tools now together with a brief reason.`;
  }

  const quoted = JSON.stringify(assistantContent);
  return (
    `${base} You only sent text (${quoted}) without calling a tool. ` +
    `Retry with a brief explanation plus the tool call — text alone cannot submit a move.`
  );
}

/** Builds the user message containing the current minimal game state and any prior errors. */
export function buildLlmUserMessage(gameState: LlmGameStatePayload, priorErrors: readonly string[]): string {
  const payload = JSON.stringify(gameState);
  if (priorErrors.length === 0) {
    return `Current game state:\n${payload}\nMake your move: call one tool and include a brief explanation of your reasoning.`;
  }
  const errors = priorErrors.map((error, index) => `${index + 1}. ${error}`).join("\n");
  return `Current game state:\n${payload}\n\nPrevious attempt errors:\n${errors}\nTry again with a valid tool call.`;
}

/** Builds the full message list for an AI turn request. */
export function buildLlmTurnMessages(
  gameState: LlmGameStatePayload,
  priorErrors: readonly string[]
): LlmContextMessage[] {
  return [
    { role: "system", content: buildLlmSystemPrompt() },
    { role: "user", content: buildLlmUserMessage(gameState, priorErrors) }
  ];
}
