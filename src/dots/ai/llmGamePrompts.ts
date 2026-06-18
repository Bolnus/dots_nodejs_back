import type { LlmContextMessage } from "../../llmTypes.js";
import type { DotsServerAction, GridPoint } from "../game-synced/types.js";
import type { LlmGameStatePayload } from "./llmGameTypes.js";
import { describeExpectedToolArguments } from "./llmGameTools.js";

/** Formats a grid point for turn guidance messages. */
function formatPoint(point: GridPoint): string {
  return `(${point.r},${point.c})`;
}

/** Builds the system prompt describing dots rules and tool usage for the LLM. */
export function buildLlmSystemPrompt(): string {
  return [
    "You are playing the game Dots (точки) as the AI opponent.",
    "Each turn you receive the current game state as JSON and must call exactly one tool.",
    "",
    "## Goal",
    "Enclose opponent dots in a loop of your dots (8-adjacent / king moves).",
    "Each opponent dot strictly inside the loop scores +1 for you; enclosed cells become blocked.",
    "",
    "## Board (`cells[r][c]`)",
    '- owner: "player0" | "player1" | null',
    "- blocked: true → cannot place a dot or use in a capture ring",
    "- yourPlayer: which player you are; opponentPlayer is the other one",
    "",
    "## Precomputed hints (trust these)",
    "- validCaptures: legal COMMIT_CAPTURE moves for you now. Each entry has ring (use as-is) and scoredDots.",
    "- opponentCaptureThreats: empty cells where the opponent could capture on their next turn if you do not block.",
    "- captureOpportunities: your shortest multi-turn paths to a future capture (turnsRemaining, recommendedPlacement, closingCell).",
    "- opponentThreats: opponent multi-turn capture plans (turnsUntilCapture, interceptPlacements, closingCell).",
    "",
    "## Turn priority",
    "1. If validCaptures is non-empty → COMMIT_CAPTURE (pick the capture that scores the most opponent dots).",
    "2. Else if opponentCaptureThreats is non-empty → COMMIT_PLACEMENT on one of those cells to block.",
    "3. Else if opponentThreats has an entry with turnsUntilCapture ≤ your best captureOpportunities.turnsRemaining →",
    "   COMMIT_PLACEMENT on one of that threat's interceptPlacements (prefer cells shared by multiple threats).",
    "4. Else if captureOpportunities is non-empty → COMMIT_PLACEMENT on the best entry's recommendedPlacement.",
    "5. Else → COMMIT_PLACEMENT on a neutral empty cell adjacent to your dots to extend toward future captures.",
    "",
    "## COMMIT_PLACEMENT vs COMMIT_CAPTURE",
    "These are different move types. Do not use COMMIT_PLACEMENT on a closing cell when a capture is available.",
    "",
    "| Situation | Tool | What you submit |",
    "|-----------|------|-----------------|",
    "| Opponent can close a loop around your dots with one more dot | COMMIT_PLACEMENT | That single cell {r,c} |",
    "| Your dots almost close a loop around opponent dots | COMMIT_CAPTURE | Full ring, not just closing cell |",
    "",
    "## COMMIT_PLACEMENT",
    "Place one dot on an empty, unblocked cell. Does NOT capture or enclose anything.",
    "",
    "## COMMIT_CAPTURE",
    "One atomic move: places your closing dot AND completes the capture.",
    "Use when your existing unblocked dots almost form a closed 8-adjacent loop and one empty cell finishes it.",
    "",
    "ring format:",
    "- ring[0]: empty unblocked starter cell (your new dot this turn)",
    "- ring[1..n-1]: your existing unblocked dots in walk order around the loop (each step 8-adjacent)",
    "- ring[n]: same as ring[0] (close the loop)",
    "- At least one opponent dot must lie strictly INSIDE the loop (not on the ring boundary)",
    "",
    "Example capture ring (player1):",
    '[{"r":1,"c":5},{"r":2,"c":4},{"r":1,"c":3},{"r":0,"c":4},{"r":1,"c":5}]',
    "Here (1,5) is the new dot; (2,4), (1,3), (0,4) are existing own dots walked in order.",
    "",
    "## polygons",
    "Past completed captures ({ owner, ring }). New captures appear here only after you commit them.",
    "",
    "Every response must include exactly one tool call: COMMIT_PLACEMENT, COMMIT_CAPTURE, or SURRENDER."
  ].join("\n");
}

/** Builds a retry error when the LLM response omitted the required tool call. */
export function buildMissingToolCallError(assistantContent: string | null): string {
  const tools = "COMMIT_PLACEMENT, COMMIT_CAPTURE, or SURRENDER";
  const base =
    `Your previous response did not include a tool call, so your move was not applied. ` +
    `Every turn you must call exactly one tool (${tools}) to submit your move.`;

  const quoted = JSON.stringify(assistantContent);
  return (
    `${base} You only sent text (${quoted}) without calling a tool. ` +
    `Retry with a tool call — text alone cannot submit a move.`
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
export function buildCommitRejectedError(messageLocal: string, action: DotsServerAction): string {
  return `${messageLocal}. Provided action: ${JSON.stringify(action)}`;
}

/** Builds turn guidance based on precomputed capture hints. */
function buildTurnGuidance(gameState: LlmGameStatePayload): string {
  if (gameState.validCaptures.length > 0) {
    const [best] = gameState.validCaptures;
    const captureCount = gameState.validCaptures.length;
    const scoredCount = best.scoredDots.length;
    return (
      `validCaptures has ${captureCount} option(s); best scores ${scoredCount} opponent dot(s). ` +
      "Prefer COMMIT_CAPTURE with a ring from validCaptures."
    );
  }
  if (gameState.opponentCaptureThreats.length > 0) {
    return (
      `opponentCaptureThreats has ${gameState.opponentCaptureThreats.length} cell(s). ` +
      "Consider COMMIT_PLACEMENT on one of those cells to block."
    );
  }

  const [bestOpportunity] = gameState.captureOpportunities;
  const [bestThreat] = gameState.opponentThreats;

  if (bestThreat !== undefined && bestOpportunity !== undefined) {
    if (bestThreat.turnsUntilCapture <= bestOpportunity.turnsRemaining) {
      const [intercept] = bestThreat.interceptPlacements;
      return (
        `Opponent may capture in ${bestThreat.turnsUntilCapture} turn(s) (${bestThreat.potentialScore} dot(s)); ` +
        `your best capture in ${bestOpportunity.turnsRemaining} turn(s) (${bestOpportunity.potentialScore} dot(s)). ` +
        `Prefer COMMIT_PLACEMENT to block at ${formatPoint(intercept)}.`
      );
    }
    const { recommendedPlacement, closingCell, turnsRemaining, potentialScore } = bestOpportunity;
    return (
      `Your best capture in ${turnsRemaining} turn(s) (${potentialScore} dot(s)); ` +
      `opponent threat in ${bestThreat.turnsUntilCapture} turn(s). ` +
      `Prefer COMMIT_PLACEMENT at ${formatPoint(recommendedPlacement)} ` +
      `toward closing ${formatPoint(closingCell)}.`
    );
  }

  if (bestThreat !== undefined) {
    const [intercept] = bestThreat.interceptPlacements;
    return (
      `Opponent may capture in ${bestThreat.turnsUntilCapture} turn(s) (${bestThreat.potentialScore} dot(s)). ` +
      `Prefer COMMIT_PLACEMENT to block at ${formatPoint(intercept)}.`
    );
  }

  if (bestOpportunity !== undefined) {
    const { recommendedPlacement, closingCell, turnsRemaining, potentialScore } = bestOpportunity;
    return (
      `Best capture in ${turnsRemaining} turn(s) (${potentialScore} dot(s)). ` +
      `Prefer COMMIT_PLACEMENT at ${formatPoint(recommendedPlacement)} ` +
      `toward closing ${formatPoint(closingCell)}.`
    );
  }

  return "No capture or block is precomputed; COMMIT_PLACEMENT on a neutral cell adjacent to your dots.";
}

/** Builds the user message containing the current minimal game state and any prior errors. */
export function buildLlmUserMessage(gameState: LlmGameStatePayload, priorErrors: readonly string[]): string {
  const payload = JSON.stringify(gameState);
  const guidance = buildTurnGuidance(gameState);
  if (priorErrors.length === 0) {
    return (
      `Current game state:\n${payload}\n\n` +
      `${guidance}\n` +
      "Make your move: call one tool and include a brief explanation of your reasoning."
    );
  }
  const errors = priorErrors.map((error, index) => `${index + 1}. ${error}`).join("\n");
  return (
    `Current game state:\n${payload}\n\n` +
    `${guidance}\n\n` +
    `Previous attempt errors:\n${errors}\nTry again with a valid tool call.`
  );
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
