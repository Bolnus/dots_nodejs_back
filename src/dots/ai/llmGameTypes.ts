import type { DotsServerGameState, GridPoint, PlayerId } from "../game-synced/types.js";

/** One precomputed legal capture the LLM can commit via COMMIT_CAPTURE. */
export type LlmValidCapture = Readonly<{
  ring: GridPoint[];
  scoredDots: GridPoint[];
}>;

/** Multi-turn path for the AI to reach a future capture (2+ placements before COMMIT_CAPTURE). */
export type LlmCaptureOpportunity = Readonly<{
  turnsRemaining: number;
  potentialScore: number;
  recommendedPlacement: GridPoint;
  closingCell: GridPoint;
}>;

/** Multi-turn opponent capture the AI can delay by blocking intercept cells. */
export type LlmOpponentThreat = Readonly<{
  turnsUntilCapture: number;
  potentialScore: number;
  interceptPlacements: readonly GridPoint[];
  closingCell: GridPoint;
}>;

/** Coordinate strings derived from LLM hint arrays for logging. */
export type LlmGameHintSummary = Readonly<{
  validCaptures?: string[];
  opponentCaptureThreats?: string[];
  captureOpportunities?: string[];
  opponentThreats?: string[];
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
  captureOpportunities: readonly LlmCaptureOpportunity[];
  opponentThreats: readonly LlmOpponentThreat[];
}>;
