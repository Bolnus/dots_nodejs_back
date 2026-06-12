import type { DotsServerGameState, GridPoint, PlayerId } from "../game-synced/types.js";

/** One precomputed legal capture the LLM can commit via COMMIT_CAPTURE. */
export type LlmValidCapture = Readonly<{
  ring: GridPoint[];
  scoredDots: GridPoint[];
}>;

/** Minimal gameplay payload sent to the LLM (no hash, version, or presence). */
export type LlmGameStatePayload = Readonly<{
  config: DotsServerGameState["config"];
  cells: DotsServerGameState["cells"];
  scores: DotsServerGameState["scores"];
  polygons: DotsServerGameState["polygons"];
  mode: DotsServerGameState["mode"];
  yourPlayer: PlayerId;
  opponentPlayer: PlayerId;
  validCaptures: readonly LlmValidCapture[];
  opponentCaptureThreats: readonly GridPoint[];
}>;
