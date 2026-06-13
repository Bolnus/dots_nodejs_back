import type { DotsServerGameState } from "../game-synced/types.js";
import { aiPlayerSlot } from "../aiPlayerService.js";
import type { RoomWithMembers } from "../membershipConsts.js";
import { enumerateOpponentCaptureThreats, enumerateValidCaptures, opponentPlayerOf } from "./llmGameCaptures.js";
import { enumerateCaptureOpportunities, enumerateMultiTurnOpponentThreats } from "./llmGamePlanning.js";
import type { LlmGameStatePayload } from "./llmGameTypes.js";

/** Projects authoritative server state to the minimal LLM-facing shape. */
export function toLlmGameState(room: RoomWithMembers, state: DotsServerGameState): LlmGameStatePayload | null {
  const slot = aiPlayerSlot(room);
  if (slot === null) {
    return null;
  }
  const opponentPlayer = opponentPlayerOf(slot);
  return {
    config: state.config,
    cells: state.cells,
    scores: state.scores,
    polygons: state.polygons,
    mode: state.mode,
    yourPlayer: slot,
    opponentPlayer,
    validCaptures: enumerateValidCaptures(state.cells, slot),
    opponentCaptureThreats: enumerateOpponentCaptureThreats(state.cells, slot),
    captureOpportunities: enumerateCaptureOpportunities(state.cells, slot),
    opponentThreats: enumerateMultiTurnOpponentThreats(state.cells, slot)
  };
}
