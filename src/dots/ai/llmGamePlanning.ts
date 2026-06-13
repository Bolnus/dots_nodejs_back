import { areNeighbourCells } from "../game-synced/logic.js";
import type { CellState, GridPoint, PlayerId } from "../game-synced/types.js";
import { cellsWithDot, opponentPlayerOf, tryCaptureRing } from "./llmGameCaptures.js";
import type { LlmCaptureOpportunity, LlmOpponentThreat } from "./llmGameTypes.js";

const PLANNING_MAX_MISSING = 5;
const MAX_PARTIAL_CAPTURES = 16;
const MAX_RING_VERTICES = 16;
const MAX_HINT_RESULTS = 5;

const KING_OFFSETS: readonly GridPoint[] = [
  { r: -1, c: -1 },
  { r: -1, c: 0 },
  { r: -1, c: 1 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
  { r: 1, c: -1 },
  { r: 1, c: 0 },
  { r: 1, c: 1 }
];

/** Stable key for a list of grid points. */
function pointsKey(points: readonly GridPoint[]): string {
  return points
    .map((point) => `${point.r},${point.c}`)
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

/** Ring vertices without the closing duplicate of the starter. */
function ringUniqueVertices(ring: readonly GridPoint[]): GridPoint[] {
  if (ring.length <= 1) {
    return [...ring];
  }
  return ring.slice(0, ring.length - 1);
}

/** True when `point` lies on the current DFS path. */
function isPointOnPath(path: readonly GridPoint[], point: GridPoint): boolean {
  return path.some((pathPoint) => pathPoint.r === point.r && pathPoint.c === point.c);
}

/** Counts empty cells on the current ring path (starter is tracked separately). */
function countEmptyOnPath(cells: CellState[][], path: readonly GridPoint[]): number {
  let count = 0;
  for (const point of path) {
    const cell = cells[point.r]?.[point.c];
    if (cell !== undefined && cell.owner === null) {
      count += 1;
    }
  }
  return count;
}

/** Own dots and candidate empty ring cells used to bound partial-ring search. */
type PlanningVertices = Readonly<{
  ownDots: GridPoint[];
  ringEmptyCells: GridPoint[];
}>;

/** True when `point` is an empty unblocked cell adjacent to at least one own dot. */
function isCandidateRingEmptyCell(cells: CellState[][], point: GridPoint, ownDots: readonly GridPoint[]): boolean {
  const cell = cells[point.r]?.[point.c];
  if (cell === undefined || cell.blocked || cell.owner !== null) {
    return false;
  }
  return ownDots.some((ownDot) => areNeighbourCells(point, ownDot));
}

/** Collects own dots and empty cells adjacent to at least one own dot. */
function collectPlanningVertices(cells: CellState[][], capturer: PlayerId): PlanningVertices {
  const ownDots: GridPoint[] = [];
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[row][col];
      if (!cell.blocked && cell.owner === capturer) {
        ownDots.push({ r: row, c: col });
      }
    }
  }

  const ringEmptyCells: GridPoint[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const point: GridPoint = { r: row, c: col };
      if (isCandidateRingEmptyCell(cells, point, ownDots)) {
        ringEmptyCells.push(point);
      }
    }
  }

  return { ownDots, ringEmptyCells };
}

/** Empty ring vertices that `capturer` still needs to fill before capturing. */
function missingRingVertices(cells: CellState[][], ring: readonly GridPoint[], capturer: PlayerId): GridPoint[] {
  const missing: GridPoint[] = [];
  for (const vertex of ringUniqueVertices(ring)) {
    const cell = cells[vertex.r]?.[vertex.c];
    if (cell === undefined || cell.blocked) {
      return [];
    }
    if (cell.owner === capturer) {
      continue;
    }
    if (cell.owner === null) {
      missing.push(vertex);
      continue;
    }
    return [];
  }
  return missing;
}

/** Fills every empty ring vertex except the capture starter. */
function cellsWithFilledRing(
  cells: CellState[][],
  ring: readonly GridPoint[],
  capturer: PlayerId,
  starter: GridPoint
): CellState[][] {
  let result = cells;
  for (const vertex of ringUniqueVertices(ring)) {
    if (vertex.r === starter.r && vertex.c === starter.c) {
      continue;
    }
    const cell = result[vertex.r]?.[vertex.c];
    if (cell !== undefined && cell.owner === null && !cell.blocked) {
      result = cellsWithDot(result, vertex, capturer);
    }
  }
  return result;
}

/** Counts how many own dots neighbour `point` on the current board. */
function countOwnNeighbors(cells: CellState[][], point: GridPoint, capturer: PlayerId): number {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[row][col];
      if (cell.owner === capturer && areNeighbourCells(point, { r: row, c: col })) {
        count += 1;
      }
    }
  }
  return count;
}

/** Picks the better of two candidate placement cells. */
function pickBetterPlacement(cells: CellState[][], left: GridPoint, right: GridPoint, capturer: PlayerId): GridPoint {
  const leftScore = countOwnNeighbors(cells, left, capturer);
  const rightScore = countOwnNeighbors(cells, right, capturer);
  if (rightScore > leftScore) {
    return right;
  }
  if (rightScore < leftScore) {
    return left;
  }
  const leftKey = `${left.r},${left.c}`;
  const rightKey = `${right.r},${right.c}`;
  return rightKey.localeCompare(leftKey) < 0 ? right : left;
}

/** Picks the best ring cell to fill this turn (prefer non-starter with most own neighbours). */
function pickRecommendedPlacement(
  cells: CellState[][],
  missing: readonly GridPoint[],
  starter: GridPoint,
  capturer: PlayerId
): GridPoint {
  const candidates = missing.filter((point) => !(point.r === starter.r && point.c === starter.c));
  const pool = candidates.length > 0 ? candidates : [...missing];
  const [first, ...rest] = pool;
  return rest.reduce((best, point) => pickBetterPlacement(cells, best, point, capturer), first);
}

type PartialCaptureCandidate = Readonly<{
  turnsRemaining: number;
  potentialScore: number;
  recommendedPlacement: GridPoint;
  closingCell: GridPoint;
  interceptPlacements: GridPoint[];
  scoredDots: GridPoint[];
}>;

type PartialRingSearchContext = Readonly<{
  cells: CellState[][];
  starter: GridPoint;
  capturer: PlayerId;
  maxMissing: number;
  ownDots: readonly GridPoint[];
  ringEmptyCells: readonly GridPoint[];
  seenResults: Set<string>;
  results: PartialCaptureCandidate[];
}>;

/** Records a closed ring when it yields a valid multi-turn capture. */
function tryRecordPartialCapture(context: PartialRingSearchContext, path: GridPoint[]): void {
  const { cells, starter, capturer, maxMissing, seenResults, results } = context;
  if (results.length >= MAX_PARTIAL_CAPTURES) {
    return;
  }
  const closedRing: GridPoint[] = [starter, ...path, starter];
  const missing = missingRingVertices(cells, closedRing, capturer);
  if (missing.length < 2 || missing.length > maxMissing) {
    return;
  }
  const filled = cellsWithFilledRing(cells, closedRing, capturer, starter);
  const capture = tryCaptureRing(filled, closedRing, capturer);
  if (capture === null) {
    return;
  }
  const scoredKey = pointsKey(capture.scoredDots);
  const resultKey = `${scoredKey}|${missing.length}`;
  if (seenResults.has(resultKey)) {
    return;
  }
  seenResults.add(resultKey);
  results.push({
    turnsRemaining: missing.length,
    potentialScore: capture.scoredDots.length,
    recommendedPlacement: pickRecommendedPlacement(cells, missing, starter, capturer),
    closingCell: starter,
    interceptPlacements: [...missing],
    scoredDots: capture.scoredDots
  });
}

/** True when `point` may extend the partial ring path from `current`. */
function canExtendPartialRing(
  context: PartialRingSearchContext,
  path: readonly GridPoint[],
  current: GridPoint,
  point: GridPoint
): boolean {
  const { cells, starter, capturer, maxMissing, ownDots, ringEmptyCells } = context;
  if (point.r === starter.r && point.c === starter.c) {
    return false;
  }
  if (isPointOnPath(path, point)) {
    return false;
  }
  if (!areNeighbourCells(current, point)) {
    return false;
  }
  const cell = cells[point.r]?.[point.c];
  if (cell === undefined || cell.blocked) {
    return false;
  }
  if (cell.owner === capturer) {
    return ownDots.some((ownDot) => ownDot.r === point.r && ownDot.c === point.c);
  }
  if (cell.owner !== null) {
    return false;
  }
  if (!ringEmptyCells.some((emptyCell) => emptyCell.r === point.r && emptyCell.c === point.c)) {
    return false;
  }
  return countEmptyOnPath(cells, path) + 1 <= maxMissing - 1;
}

/** Visits king neighbours that can extend a partial capture ring path. */
function forEachPartialRingNeighbor(
  context: PartialRingSearchContext,
  path: readonly GridPoint[],
  current: GridPoint,
  visit: (next: GridPoint) => void
): void {
  const rows = context.cells.length;
  const cols = context.cells[0]?.length ?? 0;
  for (const offset of KING_OFFSETS) {
    const next: GridPoint = { r: current.r + offset.r, c: current.c + offset.c };
    if (next.r < 0 || next.c < 0 || next.r >= rows || next.c >= cols) {
      continue;
    }
    if (!canExtendPartialRing(context, path, current, next)) {
      continue;
    }
    visit(next);
  }
}

/** DFS from `starter` through own dots and bounded empty ring cells. */
function searchPartialCaptureRing(context: PartialRingSearchContext, path: GridPoint[], current: GridPoint): void {
  if (context.results.length >= MAX_PARTIAL_CAPTURES || path.length > MAX_RING_VERTICES) {
    return;
  }
  if (path.length >= 2 && areNeighbourCells(current, context.starter)) {
    tryRecordPartialCapture(context, path);
  }
  forEachPartialRingNeighbor(context, path, current, (next) =>
    searchPartialCaptureRing(context, [...path, next], next)
  );
}

/** DFS from `starter` through own/empty cells to find multi-turn capture rings. */
function findPartialCapturesFromStarter(context: PartialRingSearchContext): void {
  forEachPartialRingNeighbor(context, [], context.starter, (next) => searchPartialCaptureRing(context, [next], next));
}

/** Compares partial captures: fewer turns first, then higher score. */
function comparePartialCaptures(left: PartialCaptureCandidate, right: PartialCaptureCandidate): number {
  if (left.turnsRemaining !== right.turnsRemaining) {
    return left.turnsRemaining - right.turnsRemaining;
  }
  return right.potentialScore - left.potentialScore;
}

/** Finds multi-turn capture rings for `capturer` with up to `maxMissing` empty ring cells. */
function enumeratePartialCaptures(
  cells: CellState[][],
  capturer: PlayerId,
  maxMissing: number
): PartialCaptureCandidate[] {
  const results: PartialCaptureCandidate[] = [];
  const seenResults = new Set<string>();
  const { ownDots, ringEmptyCells } = collectPlanningVertices(cells, capturer);
  if (ownDots.length === 0) {
    return results;
  }

  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (results.length >= MAX_PARTIAL_CAPTURES) {
        break;
      }
      const starter: GridPoint = { r: row, c: col };
      const starterCell = cells[row][col];
      if (starterCell === undefined || starterCell.blocked || starterCell.owner !== null) {
        continue;
      }
      findPartialCapturesFromStarter({
        cells,
        starter,
        capturer,
        maxMissing,
        ownDots,
        ringEmptyCells,
        seenResults,
        results
      });
    }
  }

  return results.sort(comparePartialCaptures);
}

/** Multi-turn capture opportunities for the AI (2+ placements before COMMIT_CAPTURE). */
export function enumerateCaptureOpportunities(cells: CellState[][], yourPlayer: PlayerId): LlmCaptureOpportunity[] {
  return enumeratePartialCaptures(cells, yourPlayer, PLANNING_MAX_MISSING)
    .slice(0, MAX_HINT_RESULTS)
    .map(({ turnsRemaining, potentialScore, recommendedPlacement, closingCell }) => ({
      turnsRemaining,
      potentialScore,
      recommendedPlacement,
      closingCell
    }));
}

/** Multi-turn opponent capture threats the AI can intercept (2+ opponent placements away). */
export function enumerateMultiTurnOpponentThreats(cells: CellState[][], yourPlayer: PlayerId): LlmOpponentThreat[] {
  const opponent = opponentPlayerOf(yourPlayer);
  return enumeratePartialCaptures(cells, opponent, PLANNING_MAX_MISSING)
    .slice(0, MAX_HINT_RESULTS)
    .map(({ turnsRemaining, potentialScore, interceptPlacements, closingCell }) => ({
      turnsUntilCapture: turnsRemaining,
      potentialScore,
      interceptPlacements,
      closingCell
    }));
}
