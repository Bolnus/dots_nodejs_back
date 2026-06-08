import { currentServerPlacingPlayer } from "../game-synced/serverReducer.js";
import type { DotsServerGameState, PlayerId } from "../game-synced/types.js";
import { aiPlayerSlot } from "../aiPlayerService.js";
import type { RoomWithMembers } from "../membershipConsts.js";

/** Minimal gameplay payload sent to the LLM (no hash, version, or presence). */
export type LlmGameStatePayload = Readonly<{
  config: DotsServerGameState["config"];
  cells: DotsServerGameState["cells"];
  scores: DotsServerGameState["scores"];
  polygons: DotsServerGameState["polygons"];
  mode: DotsServerGameState["mode"];
  currentPlayer: PlayerId;
  yourPlayer: PlayerId;
}>;

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
