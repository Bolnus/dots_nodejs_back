import type { LlmContextMessage } from "../../llmTypes.js";
import type { DotsServerAction } from "../game-synced/types.js";
import type { LlmGameStatePayload } from "./llmGameTypes.js";
import { describeExpectedToolArguments } from "./llmGameTools.js";

/** Builds the system prompt describing dots rules and tool usage for the LLM. */
export function buildLlmSystemPrompt(): string {
  return [
    "You are playing the game Dots (точки) as the AI opponent.",
    "Below is the current game state in JSON format.",
    "It contains the scores, the polygons, the cells, and player names.",
    "Your player name is under yourPlayer key.",
    "The cells field contains the current state of the game board.",
    "The cells field is a 2D array of objects with the following keys: owner, blocked.",
    "The owner key is the player id of the player who owns the cell, or null if the cell is empty.",
    "The blocked key is a boolean indicating if the cell is blocked, ",
    "which means it is owned by the opponent and cannot be captured.",
    "The polygons field contains the current state of the game board.",
    "The polygons field is a 2D array of objects with the following keys: owner, ring.",
    "The owner key is the player id of the player who owns the polygon, or null if the polygon is empty.",
    "The ring key is an array of grid points that form the polygon.",
    "Your opponent is going to outline your dots with his own dots creating a chain of adjacent dots.",
    "When he does that, a polygons is created, your dots will be blocked and you will lose points.",
    "Your goal is to find which of your dots are in danger of being captured by your opponent.",
    "This would mean he needs exactly one placement to outline them and make a polygon around.",
    "You need to place your dot in an unblocked cell which your opponent needs to visit to capture your dots.",
    "If no immediate danger is found, try to figure out the best move for the future.",
    "Every response must include:",
    "Exactly one tool call — COMMIT_PLACEMENT."
    // "1. Exactly one tool call — COMMIT_PLACEMENT, COMMIT_CAPTURE, or SURRENDER — to submit your move.",
    // "2. A brief message (1–2 sentences) explaining why you chose that move.",
    // "The tool call applies your move; the message is shown in chat.",
    // Text without a tool call does not count as a move.",
    // "Rules:",
    // "- Players alternate placing dots on empty grid intersections.",
    // "- A capture encloses opponent dots: start on an empty cell,"
    // "walk through adjacent own dots, close on the start.",
    // "- Captured cells become blocked; enclosed opponent dots score for the capturer.",
    // "- When the board is full, higher score wins.",
    // "- Call SURRENDER if you cannot possibly win given the current scores and remaining playable cells.",
    // "- Your first goal is to capture opponent's dots.",
    // "Make sure the dots you are planning to capture are not protected by the field borders.",
    // "- Your second goal is to analyze wheather any of your dots are in danger of being captured.",
    // "If the opponent is definetly going to capture your dots,",
    // "try to protect them by placing your dots in a way that will block the opponent's capture.",
    // "- Always set `by` to your assigned player id (`yourPlayer` in the game state)."
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

/** Builds a retry error when tool arguments could not be parsed into an action. */
export function buildInvalidToolArgumentsError(toolName: string, argumentsJson: string): string {
  return (
    `Invalid tool arguments for ${toolName}. ` +
    `Expected: ${describeExpectedToolArguments(toolName)}. ` +
    `Got: ${argumentsJson}`
  );
}

/** Builds a retry error when the game server rejected a parsed action. */
export function buildCommitRejectedError(reason: string, action: DotsServerAction): string {
  return `${reason}. Provided action: ${JSON.stringify(action)}`;
}

/** Builds the user message containing the current minimal game state and any prior errors. */
export function buildLlmUserMessage(gameState: LlmGameStatePayload, priorErrors: readonly string[]): string {
  const payload = JSON.stringify(gameState);
  if (priorErrors.length === 0) {
    return (
      `Current game state:\n${payload}\n` +
      "Make your move: call one tool and include a brief explanation of your reasoning."
    );
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
