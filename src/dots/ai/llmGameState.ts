import type { DotsServerGameState } from "../game-synced/types.js";
import { gridPointKey } from "../game-synced/logic.js";
import { aiPlayerSlot } from "../aiPlayerService.js";
import type { RoomWithMembers } from "../membershipConsts.js";
import { enumerateValidCaptures, opponentCaptureThreatsFromCaptures, opponentPlayerOf } from "./llmGameCaptures.js";
import { enumerateMultiTurnHints } from "./llmGamePlanning.js";
import type { LlmCaptureOpportunity, LlmGameStatePayload, LlmOpponentThreat } from "./llmGameTypes.js";

/** Projects authoritative server state to the minimal LLM-facing shape. */
export function toLlmGameState(room: RoomWithMembers, state: DotsServerGameState): LlmGameStatePayload | null {
  const slot = aiPlayerSlot(room);
  if (slot === null) {
    return null;
  }
  const opponentPlayer = opponentPlayerOf(slot);
  const validCaptures = enumerateValidCaptures(state.cells, slot);
  const opponentValidCaptures = enumerateValidCaptures(state.cells, opponentPlayer);
  const opponentCaptureThreats = opponentCaptureThreatsFromCaptures(opponentValidCaptures);

  let captureOpportunities: readonly LlmCaptureOpportunity[] = [];
  let opponentThreats: readonly LlmOpponentThreat[] = [];
  if (validCaptures.length === 0 && opponentCaptureThreats.length === 0) {
    const multiTurnHints = enumerateMultiTurnHints(state.cells, slot);
    captureOpportunities = multiTurnHints.captureOpportunities;
    opponentThreats = multiTurnHints.opponentThreats;
  }

  return {
    config: state.config,
    cells: state.cells,
    scores: state.scores,
    polygons: state.polygons,
    mode: state.mode,
    yourPlayer: slot,
    opponentPlayer,
    validCaptures,
    opponentCaptureThreats,
    captureOpportunities,
    opponentThreats
  };
}

/** Joins grid coordinate keys for display in chat sentences. */
function formatCoordinateList(coordinates: readonly string[]): string {
  return coordinates.join(", ");
}

/** Summarizes LLM hint arrays as human-readable sentences for room chat. */
export function summarizeLlmGameHints(gameState: LlmGameStatePayload): string {
  const sentences: string[] = [];

  const validCaptures = gameState.validCaptures.map((capture) => gridPointKey(capture.ring[0]));
  if (validCaptures.length > 0) {
    sentences.push(`I can complete a capture now by placing at: ${formatCoordinateList(validCaptures)}.`);
  }

  const opponentCaptureThreats = gameState.opponentCaptureThreats.map(gridPointKey);
  if (opponentCaptureThreats.length > 0) {
    sentences.push(
      `Opponent could complete a capture on their next turn at: ${formatCoordinateList(opponentCaptureThreats)}.`
    );
  }

  const captureOpportunities = gameState.captureOpportunities.map((opportunity) =>
    gridPointKey(opportunity.recommendedPlacement)
  );
  if (captureOpportunities.length > 0) {
    sentences.push(`Future capture opportunities detected by placing at: ${formatCoordinateList(captureOpportunities)}.`);
  }

  const opponentThreats = gameState.opponentThreats.map((threat) => gridPointKey(threat.interceptPlacements[0]));
  if (opponentThreats.length > 0) {
    sentences.push(`I need to block upcoming opponent captures by placing at: ${formatCoordinateList(opponentThreats)}.`);
  }

  return sentences.join("\n");
}
