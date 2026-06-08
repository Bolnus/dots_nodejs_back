import { currentServerPlacingPlayer } from "../game-synced/serverReducer.js";
import type { DotsServerGameState } from "../game-synced/types.js";
import { aiPlayerSlot } from "../aiPlayerService.js";
import type { RoomWithMembers } from "../membershipConsts.js";
import type { LlmGameStatePayload } from "./llmGameTypes.js";

/** Projects authoritative server state to the minimal LLM-facing shape. */
export function toLlmGameState(room: RoomWithMembers, state: DotsServerGameState): LlmGameStatePayload | null {
  const slot = aiPlayerSlot(room);
  if (slot === null) {
    return null;
  }
  return {
    config: state.config,
    cells: state.cells,
    scores: state.scores,
    polygons: state.polygons,
    mode: state.mode,
    currentPlayer: currentServerPlacingPlayer(state),
    yourPlayer: slot
  };
}
