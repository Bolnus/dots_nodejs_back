import {
  applyCapture,
  computeCapture,
  computeScoresFromGridAndPolygons,
  isCaptureRingConnected,
  normalizeCaptureRing
} from "./logic.js";
import { computeServerStateHash } from "./serverState.js";
import type {
  CellState,
  DotsServerAction,
  DotsServerGameState,
  FilledPolygon,
  GridPoint,
  PlayerId,
  ReduceServerRejectReason,
  ReduceServerResult
} from "./types.js";

/** Player whose turn it is to place a dot next, based on parity of committed placements. */
export function currentServerPlacingPlayer(state: DotsServerGameState): PlayerId {
  return state.dotsPlacedCount % 2 === 0 ? "player0" : "player1";
}

/** Returns a fresh 2D copy of `cells` with `point` set to the given cell value. */
function cellsWithDot(cells: CellState[][], point: GridPoint, owner: PlayerId): CellState[][] {
  return cells.map((row, rowIndex) =>
    row.map(
      (existing, colIndex): CellState =>
        rowIndex === point.r && colIndex === point.c ? { owner, blocked: false } : existing
    )
  );
}

/** Wraps an updated server state with a fresh hash and bumped version. */
function withHashAndVersion(next: Omit<DotsServerGameState, "hash">): DotsServerGameState {
  const bumped: Omit<DotsServerGameState, "hash"> = { ...next, version: next.version + 1 };
  return { ...bumped, hash: computeServerStateHash(bumped) };
}

/** Builds a reducer rejection that preserves the incoming authoritative state. */
function reject(state: DotsServerGameState, reason: ReduceServerRejectReason): ReduceServerResult {
  return { ok: false, reason, state };
}

/** Builds a reducer success with the next authoritative state. */
function accept(state: DotsServerGameState): ReduceServerResult {
  return { ok: true, state };
}

/** Applies a committed dot placement (no-op when invalid). */
function applyCommitPlacement(state: DotsServerGameState, point: GridPoint, by: PlayerId): ReduceServerResult {
  if (state.mode !== "play") {
    return reject(state, "gameNotInPlay");
  }
  if (currentServerPlacingPlayer(state) !== by) {
    return reject(state, "notYourTurn");
  }
  const targetCell = state.cells[point.r]?.[point.c];
  if (!targetCell) {
    return reject(state, "placementPointOutOfBounds");
  }
  if (targetCell.blocked) {
    return reject(state, "placementCellBlocked");
  }
  if (targetCell.owner !== null) {
    return reject(state, "placementCellOccupied");
  }
  const cells = cellsWithDot(state.cells, point, by);
  return accept(
    withHashAndVersion({
      ...state,
      cells,
      dotsPlacedCount: state.dotsPlacedCount + 1
    })
  );
}

/** True when every non-start vertex is already an own, unblocked dot of `by`. */
function ringVerticesAreOwn(cells: CellState[][], ring: GridPoint[], by: PlayerId): boolean {
  for (let idx = 1; idx < ring.length; idx++) {
    const vertex = ring[idx];
    const vertexCell = cells[vertex.r]?.[vertex.c];
    if (!vertexCell || vertexCell.owner !== by || vertexCell.blocked) {
      return false;
    }
  }
  return true;
}

/** Applies a committed capture: places the chain starter, then the enclosure, in one step. */
function applyCommitCapture(state: DotsServerGameState, ring: GridPoint[], by: PlayerId): ReduceServerResult {
  if (state.mode !== "play") {
    return reject(state, "gameNotInPlay");
  }
  if (currentServerPlacingPlayer(state) !== by) {
    return reject(state, "notYourTurn");
  }
  const normalizedRing = normalizeCaptureRing(ring);
  if (!normalizedRing) {
    return reject(state, "captureRingTooShort");
  }
  if (!isCaptureRingConnected(normalizedRing)) {
    return reject(state, "captureRingNotConnected");
  }
  const [starter] = normalizedRing;
  const starterCell = state.cells[starter.r]?.[starter.c];
  if (!starterCell || starterCell.blocked || starterCell.owner !== null) {
    return reject(state, "invalidCaptureStarter");
  }
  const cellsWithStarter = cellsWithDot(state.cells, starter, by);
  if (!ringVerticesAreOwn(cellsWithStarter, normalizedRing, by)) {
    return reject(state, "captureRingVerticesInvalid");
  }
  const capture = computeCapture(cellsWithStarter, normalizedRing, by);
  if (!capture) {
    return reject(state, "invalidCapture");
  }
  const cellsAfter = applyCapture(cellsWithStarter, capture);
  const newPolygon: FilledPolygon = { owner: by, ring: capture.ring };
  const polygons = [...state.polygons, newPolygon];
  const scores = computeScoresFromGridAndPolygons(cellsAfter, polygons);
  return accept(
    withHashAndVersion({
      ...state,
      cells: cellsAfter,
      scores,
      polygons,
      dotsPlacedCount: state.dotsPlacedCount + 1
    })
  );
}

/** Ends the game with the opponent as the winner. */
function applySurrender(state: DotsServerGameState, by: PlayerId): ReduceServerResult {
  if (state.mode !== "play") {
    return reject(state, "gameNotInPlay");
  }
  const winner: PlayerId = by === "player0" ? "player1" : "player0";
  return accept(
    withHashAndVersion({
      ...state,
      mode: "ended",
      winner,
      surrenderedBy: by
    })
  );
}

/** True when at least one intersection can still receive a dot. */
function hasPlayableCell(cells: CellState[][]): boolean {
  for (const row of cells) {
    for (const cell of row) {
      if (!cell.blocked && cell.owner === null) {
        return true;
      }
    }
  }
  return false;
}

/** Ends the game when the board has no playable empty cells; winner by score (tie → null). */
function maybeEndOnBoardFull(state: DotsServerGameState): DotsServerGameState {
  if (state.mode !== "play" || hasPlayableCell(state.cells)) {
    return state;
  }
  const { player0, player1 } = state.scores;
  let winner: PlayerId | null = null;
  if (player0 > player1) {
    winner = "player0";
  } else if (player1 > player0) {
    winner = "player1";
  }
  return withHashAndVersion({
    ...state,
    mode: "ended",
    winner,
    surrenderedBy: null
  });
}

/** Pure server-side reducer for authoritative dots state. */
export function reduceServer(state: DotsServerGameState, action: DotsServerAction): ReduceServerResult {
  switch (action.type) {
    case "COMMIT_PLACEMENT": {
      const placement = applyCommitPlacement(state, action.point, action.by);
      if (!placement.ok) {
        return placement;
      }
      return accept(maybeEndOnBoardFull(placement.state));
    }
    case "COMMIT_CAPTURE": {
      const capture = applyCommitCapture(state, action.ring, action.by);
      if (!capture.ok) {
        return capture;
      }
      return accept(maybeEndOnBoardFull(capture.state));
    }
    case "SURRENDER":
      return applySurrender(state, action.by);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}
