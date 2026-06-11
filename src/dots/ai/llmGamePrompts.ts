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
    "Run COMMIT_PLACEMENT tool in this case.",
    "If no immediate danger is found, try to find an aggressive move which will capture opponent's dots.",
    "If there is a neutral unblocked cell, ",
    "where you could place a new dot to make a polygon with your previous adjacent dots, ",
    "run COMMIT_CAPTURE tool.",
    "The ring parameter of COMMIT_CAPTURE tool is an array of grid points that form the polygon.",
    "The first and last points in the ring array must be the same: your new dot, placed in neutral cell.",
    "The rest dots in the ring array must be your previous adjacent dots.",
    "If neither immediate danger is found, nor a polygon of yours can be made,",
    "place your dot in a neutral cell for the future capture.",
    "Every response must include:",
    "Exactly one tool call — COMMIT_PLACEMENT or COMMIT_CAPTURE."
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
