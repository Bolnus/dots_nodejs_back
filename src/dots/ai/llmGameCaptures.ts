import {
  areNeighbourCells,
  computeCapture,
  isCaptureRingConnected,
  normalizeCaptureRing,
  type CaptureResult
} from "../game-synced/logic.js";
import type { CellState, GridPoint, PlayerId } from "../game-synced/types.js";
import type { LlmValidCapture } from "./llmGameTypes.js";

const MAX_VALID_CAPTURES = 32;
const MAX_RING_OWN_DOTS = 16;

/** Returns the opposing player id. */
export function opponentPlayerOf(player: PlayerId): PlayerId {
  return player === "player0" ? "player1" : "player0";
}

/** Stable key for a list of grid points. */
function pointsKey(points: readonly GridPoint[]): string {
  return points
    .map((point) => `${point.r},${point.c}`)
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

/** Returns a grid copy with one dot placed at `point` for `owner`. */
export function cellsWithDot(cells: CellState[][], point: GridPoint, owner: PlayerId): CellState[][] {
  return cells.map((row, rowIndex) =>
    row.map(
      (existing, colIndex): CellState =>
        rowIndex === point.r && colIndex === point.c ? { owner, blocked: false } : existing
    )
  );
}

/** Validates a closed capture ring against the current grid (mirrors server reducer rules). */
export function tryCaptureRing(cells: CellState[][], ring: GridPoint[], capturer: PlayerId): CaptureResult | null {
  const normalizedRing = normalizeCaptureRing(ring);
  if (normalizedRing === null || !isCaptureRingConnected(normalizedRing)) {
    return null;
  }
  const [starter] = normalizedRing;
  const starterCell = cells[starter.r]?.[starter.c];
  if (starterCell === undefined || starterCell.blocked || starterCell.owner !== null) {
    return null;
  }
  const cellsWithStarter = cellsWithDot(cells, starter, capturer);
  for (let vertexIndex = 1; vertexIndex < normalizedRing.length; vertexIndex += 1) {
    const vertex = normalizedRing[vertexIndex];
    const vertexCell = cellsWithStarter[vertex.r]?.[vertex.c];
    if (vertexCell === undefined || vertexCell.owner !== capturer || vertexCell.blocked) {
      return null;
    }
  }
  return computeCapture(cellsWithStarter, normalizedRing, capturer);
}

/** DFS from `starter` through own dots to find simple cycles that close back on `starter`. */
function findCapturesFromStarter({
  cells,
  starter,
  ownDots,
  capturer,
  seenScored,
  results
}: {
  cells: CellState[][];
  starter: GridPoint;
  ownDots: readonly GridPoint[];
  capturer: PlayerId;
  seenScored: Set<string>;
  results: LlmValidCapture[];
}): void {
  const dfs = (path: GridPoint[], current: GridPoint): void => {
    if (results.length >= MAX_VALID_CAPTURES) {
      return;
    }
    if (path.length > MAX_RING_OWN_DOTS) {
      return;
    }
    if (path.length >= 2 && areNeighbourCells(current, starter)) {
      const closedRing: GridPoint[] = [starter, ...path, starter];
      const capture = tryCaptureRing(cells, closedRing, capturer);
      if (capture !== null) {
        const scoredKey = pointsKey(capture.scoredDots);
        if (!seenScored.has(scoredKey)) {
          seenScored.add(scoredKey);
          results.push({ ring: closedRing, scoredDots: capture.scoredDots });
        }
      }
    }
    for (const dot of ownDots) {
      if (path.some((point) => point.r === dot.r && point.c === dot.c)) {
        continue;
      }
      if (!areNeighbourCells(current, dot)) {
        continue;
      }
      dfs([...path, dot], dot);
    }
  };

  for (const dot of ownDots) {
    if (!areNeighbourCells(starter, dot)) {
      continue;
    }
    dfs([dot], dot);
  }
}

/** Enumerates legal capture rings for `capturer`, sorted by most opponent dots scored first. */
export function enumerateValidCaptures(cells: CellState[][], capturer: PlayerId): LlmValidCapture[] {
  const results: LlmValidCapture[] = [];
  const seenScored = new Set<string>();
  const ownDots: GridPoint[] = [];
  const emptyCells: GridPoint[] = [];
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[row][col];
      if (cell.blocked) {
        continue;
      }
      if (cell.owner === capturer) {
        ownDots.push({ r: row, c: col });
      } else if (cell.owner === null) {
        emptyCells.push({ r: row, c: col });
      }
    }
  }

  const countOwnNeighbors = (point: GridPoint): number => {
    let count = 0;
    for (const dot of ownDots) {
      if (areNeighbourCells(point, dot)) {
        count += 1;
      }
    }
    return count;
  };

  for (const starter of emptyCells) {
    if (results.length >= MAX_VALID_CAPTURES) {
      break;
    }
    if (countOwnNeighbors(starter) < 2) {
      continue;
    }
    findCapturesFromStarter({ cells, starter, ownDots, capturer, seenScored, results });
  }

  return results.sort((left, right) => right.scoredDots.length - left.scoredDots.length);
}

/** Empty cells where the opponent could complete a capture on their next turn. */
export function opponentCaptureThreatsFromCaptures(captures: readonly LlmValidCapture[]): GridPoint[] {
  const seenStarters = new Set<string>();
  const threats: GridPoint[] = [];
  for (const capture of captures) {
    const [starter] = capture.ring;
    const starterKey = `${starter.r},${starter.c}`;
    if (seenStarters.has(starterKey)) {
      continue;
    }
    seenStarters.add(starterKey);
    threats.push(starter);
  }
  return threats;
}

/** Empty cells where the opponent could complete a capture on their next turn. */
export function enumerateOpponentCaptureThreats(cells: CellState[][], yourPlayer: PlayerId): GridPoint[] {
  const opponent = opponentPlayerOf(yourPlayer);
  return opponentCaptureThreatsFromCaptures(enumerateValidCaptures(cells, opponent));
}
