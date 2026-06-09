import type { DotsServerGameState, PlayerId } from "../game-synced/types.js";

/** Minimal gameplay payload sent to the LLM (no hash, version, or presence). */
export type LlmGameStatePayload = Readonly<{
  config: DotsServerGameState["config"];
  cells: DotsServerGameState["cells"];
  scores: DotsServerGameState["scores"];
  polygons: DotsServerGameState["polygons"];
  mode: DotsServerGameState["mode"];
  yourPlayer: PlayerId;
}>;
