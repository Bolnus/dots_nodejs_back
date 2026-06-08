import type { LlmContextMessage } from "../../llmTypes.js";
import type { LlmGameStatePayload } from "./llmGameTypes.js";

/** Builds the system prompt describing dots rules and tool usage for the LLM. */
export function buildLlmSystemPrompt(): string {
  return [
    "You are playing the game Dots (точки) as the AI opponent.",
    "Respond by calling exactly one tool: COMMIT_PLACEMENT, COMMIT_CAPTURE, or SURRENDER.",
    "Rules:",
    "- Players alternate placing dots on empty grid intersections.",
    "- A capture encloses opponent dots: start on an empty cell, walk through adjacent own dots, close on the start.",
    "- Captured cells become blocked; enclosed opponent dots score for the capturer.",
    "- When the board is full, higher score wins.",
    "- Call SURRENDER if you cannot possibly win given the current scores and remaining playable cells.",
    "- Your gole is to capture opponent's dots.",
    "- If the opponent is about to capture your dots, try to protect them if possible.",
    "Always set `by` to your assigned player id (`yourPlayer` in the game state)."
  ].join("\n");
}

/** Builds the user message containing the current minimal game state and any prior errors. */
export function buildLlmUserMessage(gameState: LlmGameStatePayload, priorErrors: readonly string[]): string {
  const payload = JSON.stringify(gameState);
  if (priorErrors.length === 0) {
    return `Current game state:\n${payload}\nMake your move using a tool call.`;
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
