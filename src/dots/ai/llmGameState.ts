import type { DotsServerGameState } from "../game-synced/types.js";
import { gridPointKey } from "../game-synced/logic.js";
import { aiPlayerSlot } from "../aiPlayerService.js";
import type { RoomWithMembers } from "../membershipConsts.js";
import { enumerateValidCaptures, opponentCaptureThreatsFromCaptures, opponentPlayerOf } from "./llmGameCaptures.js";
import { enumerateMultiTurnHints } from "./llmGamePlanning.js";
import type {
  LlmCaptureOpportunity,
  LlmGameHintSummary,
  LlmGameStatePayload,
  LlmOpponentThreat
} from "./llmGameTypes.js";

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

/** Summarizes LLM hint arrays as suggested-placement coordinate strings. */
export function summarizeLlmGameHints(gameState: LlmGameStatePayload): LlmGameHintSummary {
  const validCaptures = gameState.validCaptures.map((capture) => gridPointKey(capture.ring[0]));
  const opponentCaptureThreats = gameState.opponentCaptureThreats.map(gridPointKey);
  const captureOpportunities = gameState.captureOpportunities.map((opportunity) =>
    gridPointKey(opportunity.recommendedPlacement)
  );
  const opponentThreats = gameState.opponentThreats.map((threat) => gridPointKey(threat.interceptPlacements[0]));

  return {
    ...(validCaptures.length > 0 ? { validCaptures } : {}),
    ...(opponentCaptureThreats.length > 0 ? { opponentCaptureThreats } : {}),
    ...(captureOpportunities.length > 0 ? { captureOpportunities } : {}),
    ...(opponentThreats.length > 0 ? { opponentThreats } : {})
  };
}
