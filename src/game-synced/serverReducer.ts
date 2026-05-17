import { applyCapture, computeCapture, computeScoresFromGridAndPolygons } from "./logic.js";
import { computeServerStateHash } from "./serverState.js";
import type { DotsServerGameState } from "./serverState.js";
import type { CellState, FilledPolygon, GridPoint, PlayerId } from "./types.js";

/** Discriminated union of committed actions accepted by the server reducer. */
export type DotsServerAction =
  | Readonly<{ type: "COMMIT_PLACEMENT"; point: GridPoint; by: PlayerId }>
  | Readonly<{ type: "COMMIT_CAPTURE"; ring: GridPoint[]; by: PlayerId }>
  | Readonly<{ type: "SURRENDER"; by: PlayerId }>;

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

/** Applies a committed dot placement (no-op when invalid). */
function applyCommitPlacement(state: DotsServerGameState, point: GridPoint, by: PlayerId): DotsServerGameState {
  if (state.mode !== "play") {
    return state;
  }
  if (currentServerPlacingPlayer(state) !== by) {
    return state;
  }
  const targetCell = state.cells[point.r]?.[point.c];
  if (!targetCell || targetCell.blocked || targetCell.owner !== null) {
    return state;
  }
  const cells = cellsWithDot(state.cells, point, by);
  return withHashAndVersion({
    ...state,
    cells,
    dotsPlacedCount: state.dotsPlacedCount + 1
  });
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
function applyCommitCapture(state: DotsServerGameState, ring: GridPoint[], by: PlayerId): DotsServerGameState {
  if (state.mode !== "play") {
    return state;
  }
  if (currentServerPlacingPlayer(state) !== by) {
    return state;
  }
  if (ring.length < 3) {
    return state;
  }
  const [starter] = ring;
  const starterCell = state.cells[starter.r]?.[starter.c];
  if (!starterCell || starterCell.blocked || starterCell.owner !== null) {
    return state;
  }
  const cellsWithStarter = cellsWithDot(state.cells, starter, by);
  if (!ringVerticesAreOwn(cellsWithStarter, ring, by)) {
    return state;
  }
  const capture = computeCapture(cellsWithStarter, ring, by);
  if (!capture) {
    return state;
  }
  const cellsAfter = applyCapture(cellsWithStarter, capture);
  const newPolygon: FilledPolygon = { owner: by, ring: capture.ring };
  const polygons = [...state.polygons, newPolygon];
  const scores = computeScoresFromGridAndPolygons(cellsAfter, polygons);
  return withHashAndVersion({
    ...state,
    cells: cellsAfter,
    scores,
    polygons,
    dotsPlacedCount: state.dotsPlacedCount + 1
  });
}

/** Ends the game with the opponent as the winner. */
function applySurrender(state: DotsServerGameState, by: PlayerId): DotsServerGameState {
  if (state.mode !== "play") {
    return state;
  }
  const winner: PlayerId = by === "player0" ? "player1" : "player0";
  return withHashAndVersion({
    ...state,
    mode: "ended",
    winner,
    surrenderedBy: by
  });
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
export function reduceServer(state: DotsServerGameState, action: DotsServerAction): DotsServerGameState {
  switch (action.type) {
    case "COMMIT_PLACEMENT":
      return maybeEndOnBoardFull(applyCommitPlacement(state, action.point, action.by));
    case "COMMIT_CAPTURE":
      return maybeEndOnBoardFull(applyCommitCapture(state, action.ring, action.by));
    case "SURRENDER":
      return applySurrender(state, action.by);
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}
