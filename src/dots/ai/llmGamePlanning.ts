import { areNeighbourCells, gridPointKey, gridPointsKey } from "../game-synced/logic.js";
import type { CellState, GridPoint, PlayerId } from "../game-synced/types.js";
import { opponentPlayerOf, tryCaptureRing } from "./llmGameCaptures.js";
import type { LlmCaptureOpportunity, LlmOpponentThreat } from "./llmGameTypes.js";

const PLANNING_MAX_MISSING = 3;
const MAX_PARTIAL_CAPTURES = 16;
const MAX_RING_VERTICES = 16;
const MAX_HINT_RESULTS = 5;
const MAX_DFS_NODES = 10_000;
const MIN_STARTER_OWN_NEIGHBORS = 2;

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

/** Ring vertices without the closing duplicate of the starter. */
function ringUniqueVertices(ring: readonly GridPoint[]): GridPoint[] {
  if (ring.length <= 1) {
    return [...ring];
  }
  return ring.slice(0, ring.length - 1);
}

/** Indexed own dots and candidate ring cells used to bound partial-ring search. */
type PlanningVertexIndex = Readonly<{
  ownDotKeys: Set<string>;
  ringEmptyKeys: Set<string>;
  candidateStarters: GridPoint[];
}>;

/** Counts own dots among the eight king neighbours of `point`. */
function countOwnNeighborsAt(cells: CellState[][], point: GridPoint, capturer: PlayerId): number {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  let count = 0;
  for (const offset of KING_OFFSETS) {
    const row = point.r + offset.r;
    const col = point.c + offset.c;
    if (row < 0 || col < 0 || row >= rows || col >= cols) {
      continue;
    }
    if (cells[row][col].owner === capturer) {
      count += 1;
    }
  }
  return count;
}

/** True when `point` is a candidate empty ring or starter cell for `capturer`. */
function classifyEmptyPlanningCell(
  cells: CellState[][],
  point: GridPoint,
  capturer: PlayerId
): "skip" | "ringEmpty" | "starter" {
  const cell = cells[point.r]?.[point.c];
  if (cell === undefined || cell.blocked || cell.owner !== null) {
    return "skip";
  }
  const neighborCount = countOwnNeighborsAt(cells, point, capturer);
  if (neighborCount === 0) {
    return "skip";
  }
  if (neighborCount >= MIN_STARTER_OWN_NEIGHBORS) {
    return "starter";
  }
  return "ringEmpty";
}

/** Collects keys of unblocked dots owned by `capturer`. */
function collectOwnDotKeys(cells: CellState[][], capturer: PlayerId): Set<string> {
  const ownDotKeys = new Set<string>();
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = cells[row][col];
      if (!cell.blocked && cell.owner === capturer) {
        ownDotKeys.add(gridPointKey({ r: row, c: col }));
      }
    }
  }
  return ownDotKeys;
}

/** Builds lookup sets and starter list for partial-ring search. */
function buildPlanningVertexIndex(cells: CellState[][], capturer: PlayerId): PlanningVertexIndex | null {
  const ownDotKeys = collectOwnDotKeys(cells, capturer);
  if (ownDotKeys.size === 0) {
    return null;
  }

  const ringEmptyKeys = new Set<string>();
  const candidateStarters: GridPoint[] = [];
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const point: GridPoint = { r: row, c: col };
      const kind = classifyEmptyPlanningCell(cells, point, capturer);
      if (kind === "skip") {
        continue;
      }
      if (kind === "starter") {
        candidateStarters.push(point);
      }
      ringEmptyKeys.add(gridPointKey(point));
    }
  }

  return { ownDotKeys, ringEmptyKeys, candidateStarters };
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

/** Fills every empty ring vertex except the capture starter in one grid copy. */
function cellsWithFilledRing(
  cells: CellState[][],
  ring: readonly GridPoint[],
  capturer: PlayerId,
  starter: GridPoint
): CellState[][] {
  const result = cells.map((row) => row.map((cell) => ({ ...cell })));
  for (const vertex of ringUniqueVertices(ring)) {
    if (vertex.r === starter.r && vertex.c === starter.c) {
      continue;
    }
    const cell = result[vertex.r]?.[vertex.c];
    if (cell !== undefined && cell.owner === null && !cell.blocked) {
      cell.owner = capturer;
    }
  }
  return result;
}

/** Picks the better of two candidate placement cells. */
function pickBetterPlacement(cells: CellState[][], left: GridPoint, right: GridPoint, capturer: PlayerId): GridPoint {
  const leftScore = countOwnNeighborsAt(cells, left, capturer);
  const rightScore = countOwnNeighborsAt(cells, right, capturer);
  if (rightScore > leftScore) {
    return right;
  }
  if (rightScore < leftScore) {
    return left;
  }
  return gridPointKey(right).localeCompare(gridPointKey(left)) < 0 ? right : left;
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
  vertexIndex: PlanningVertexIndex;
  seenResults: Set<string>;
  results: PartialCaptureCandidate[];
  dfsNodes: { count: number };
}>;

/** True when the DFS node budget is exhausted. */
function isDfsBudgetExhausted(context: PartialRingSearchContext): boolean {
  return context.dfsNodes.count >= MAX_DFS_NODES;
}

/** Records a closed ring when it yields a valid multi-turn capture. */
function tryRecordPartialCapture(context: PartialRingSearchContext, path: readonly GridPoint[]): void {
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
  const resultKey = `${gridPointsKey(capture.scoredDots)}|${missing.length}`;
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

/** Counts empty cells already on the ring path (starter tracked separately). */
function countEmptyOnPath(cells: CellState[][], path: readonly GridPoint[]): number {
  let count = 0;
  for (const pathPoint of path) {
    if (cells[pathPoint.r]?.[pathPoint.c]?.owner === null) {
      count += 1;
    }
  }
  return count;
}

/** True when `point` may extend the partial ring path from `current`. */
function canExtendPartialRing(
  context: PartialRingSearchContext,
  path: readonly GridPoint[],
  pathKeys: ReadonlySet<string>,
  current: GridPoint,
  point: GridPoint
): boolean {
  const { cells, starter, capturer, maxMissing, vertexIndex } = context;
  const nextKey = gridPointKey(point);
  if (nextKey === gridPointKey(starter) || pathKeys.has(nextKey)) {
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
    return vertexIndex.ownDotKeys.has(nextKey);
  }
  if (cell.owner !== null) {
    return false;
  }
  if (!vertexIndex.ringEmptyKeys.has(nextKey)) {
    return false;
  }
  return countEmptyOnPath(cells, path) + 1 <= maxMissing - 1;
}

/** Visits king neighbours that can extend a partial capture ring path. */
function forEachPartialRingNeighbor(
  context: PartialRingSearchContext,
  path: readonly GridPoint[],
  pathKeys: ReadonlySet<string>,
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
    if (!canExtendPartialRing(context, path, pathKeys, current, next)) {
      continue;
    }
    visit(next);
  }
}

/** Extends the partial-ring path to `next` and continues DFS. */
function visitPartialRingNeighbor(
  context: PartialRingSearchContext,
  path: GridPoint[],
  pathKeys: Set<string>,
  next: GridPoint
): void {
  path.push(next);
  pathKeys.add(gridPointKey(next));
  searchPartialCaptureRing(context, path, pathKeys, next);
  pathKeys.delete(gridPointKey(next));
  path.pop();
}

/** DFS from `starter` through own dots and bounded empty ring cells. */
function searchPartialCaptureRing(
  context: PartialRingSearchContext,
  path: GridPoint[],
  pathKeys: Set<string>,
  current: GridPoint
): void {
  if (
    isDfsBudgetExhausted(context) ||
    context.results.length >= MAX_PARTIAL_CAPTURES ||
    path.length > MAX_RING_VERTICES
  ) {
    return;
  }
  context.dfsNodes.count += 1;

  if (path.length >= 2 && areNeighbourCells(current, context.starter)) {
    tryRecordPartialCapture(context, path);
  }
  forEachPartialRingNeighbor(context, path, pathKeys, current, (next) =>
    visitPartialRingNeighbor(context, path, pathKeys, next)
  );
}

/** DFS from `starter` through own/empty cells to find multi-turn capture rings. */
function findPartialCapturesFromStarter(context: PartialRingSearchContext): void {
  if (isDfsBudgetExhausted(context)) {
    return;
  }
  const path: GridPoint[] = [];
  const pathKeys = new Set<string>();
  forEachPartialRingNeighbor(context, path, pathKeys, context.starter, (next) =>
    visitPartialRingNeighbor(context, path, pathKeys, next)
  );
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
  const vertexIndex = buildPlanningVertexIndex(cells, capturer);
  if (vertexIndex === null) {
    return [];
  }

  const results: PartialCaptureCandidate[] = [];
  const seenResults = new Set<string>();
  const dfsNodes = { count: 0 };
  const searchContext: PartialRingSearchContext = {
    cells,
    starter: { r: 0, c: 0 },
    capturer,
    maxMissing,
    vertexIndex,
    seenResults,
    results,
    dfsNodes
  };

  for (const starter of vertexIndex.candidateStarters) {
    if (results.length >= MAX_PARTIAL_CAPTURES || isDfsBudgetExhausted(searchContext)) {
      break;
    }
    findPartialCapturesFromStarter({ ...searchContext, starter });
  }

  return results.sort(comparePartialCaptures);
}

/** Maps partial capture candidates to LLM opportunity hints. */
function toCaptureOpportunities(candidates: readonly PartialCaptureCandidate[]): LlmCaptureOpportunity[] {
  return candidates
    .slice(0, MAX_HINT_RESULTS)
    .map(({ turnsRemaining, potentialScore, recommendedPlacement, closingCell }) => ({
      turnsRemaining,
      potentialScore,
      recommendedPlacement,
      closingCell
    }));
}

/** Maps partial capture candidates to LLM opponent threat hints. */
function toOpponentThreats(candidates: readonly PartialCaptureCandidate[]): LlmOpponentThreat[] {
  return candidates
    .slice(0, MAX_HINT_RESULTS)
    .map(({ turnsRemaining, potentialScore, interceptPlacements, closingCell }) => ({
      turnsUntilCapture: turnsRemaining,
      potentialScore,
      interceptPlacements,
      closingCell
    }));
}

/** Multi-turn capture opportunities for the AI (2+ placements before COMMIT_CAPTURE). */
export function enumerateCaptureOpportunities(cells: CellState[][], yourPlayer: PlayerId): LlmCaptureOpportunity[] {
  return toCaptureOpportunities(enumeratePartialCaptures(cells, yourPlayer, PLANNING_MAX_MISSING));
}

/** Multi-turn opponent capture threats the AI can intercept (2+ opponent placements away). */
export function enumerateMultiTurnOpponentThreats(cells: CellState[][], yourPlayer: PlayerId): LlmOpponentThreat[] {
  const opponent = opponentPlayerOf(yourPlayer);
  return toOpponentThreats(enumeratePartialCaptures(cells, opponent, PLANNING_MAX_MISSING));
}

/** Multi-turn hints for both players; skips work when the DFS budget is shared per call. */
export function enumerateMultiTurnHints(
  cells: CellState[][],
  yourPlayer: PlayerId
): Readonly<{ captureOpportunities: LlmCaptureOpportunity[]; opponentThreats: LlmOpponentThreat[] }> {
  return {
    captureOpportunities: enumerateCaptureOpportunities(cells, yourPlayer),
    opponentThreats: enumerateMultiTurnOpponentThreats(cells, yourPlayer)
  };
}
