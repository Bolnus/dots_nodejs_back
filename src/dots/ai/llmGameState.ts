import type { DotsServerGameState } from "../game-synced/types.js";
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
