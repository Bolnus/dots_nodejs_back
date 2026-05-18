import type { CellState, DotsGameConfig, FilledPolygon, GridPoint, PlayerId } from "./types.js";
import { DOTS_GRID_MAX, DOTS_GRID_MIN } from "./consts.js";
/** True when `value` is an integer grid dimension in `[DOTS_GRID_MIN, DOTS_GRID_MAX]`. */
export function isValidGridDimension(value: number | undefined): value is number {
  return (
    value !== undefined &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= DOTS_GRID_MIN &&
    value <= DOTS_GRID_MAX
  );
}

/** King-neighbour (8-connected), matching Qt distance < sqrt(2)*scale + 1 on a square grid. */
export function areNeighbourCells(a: GridPoint, b: GridPoint): boolean {
  const dr = Math.abs(a.r - b.r);
  const dc = Math.abs(a.c - b.c);
  return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
}

/** Creates a fresh grid with empty, unblocked cells. */
export function createEmptyGrid(config: Pick<DotsGameConfig, "rows" | "cols">): CellState[][] {
  return Array.from({ length: config.rows }, () =>
    Array.from({ length: config.cols }, () => ({ owner: null, blocked: false }))
  );
}

/** Copies the 2D grid so reducer updates remain immutable. */
function cloneGrid(cells: CellState[][]): CellState[][] {
  return cells.map((row) => row.map((cell) => ({ ...cell })));
}

/**
 * Non-zero winding rule; ring is closed implicitly (last vertex → first).
 * Vertices and test point use cell centers (c+0.5, r+0.5) mapped to y-up Cartesian
 * (`r` grows downward on the board, so y = -(r+0.5)) so winding matches Euclidean inside/outside.
 */
export function pointInPolygon(test: GridPoint, polygonRing: readonly GridPoint[]): boolean {
  if (polygonRing.length < 3) {
    return false;
  }
  const x = test.c + 0.5;
  const y = -(test.r + 0.5);
  let wn = 0;
  const n = polygonRing.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const yi = -(polygonRing[i].r + 0.5);
    const xi = polygonRing[i].c + 0.5;
    const yj = -(polygonRing[j].r + 0.5);
    const xj = polygonRing[j].c + 0.5;
    const cross = (xj - xi) * (y - yi) - (x - xi) * (yj - yi);
    if (yi <= y) {
      if (yj > y && cross > 0) {
        wn++;
      }
    } else if (yj <= y && cross < 0) {
      wn--;
    }
  }
  return wn !== 0;
}

/** Closed ring without repeating the first vertex at the end. */
export function ringFromChainPath(path: readonly GridPoint[]): GridPoint[] {
  if (path.length < 4) {
    return [];
  }
  const [first] = path;
  const last = path[path.length - 1];
  if (first.r !== last.r || first.c !== last.c) {
    return [];
  }
  return path.slice(0, -1);
}

/** True when `p` is one of the ring vertices (outline dots). */
function isRingVertex(p: GridPoint, ring: readonly GridPoint[]): boolean {
  for (const v of ring) {
    if (v.r === p.r && v.c === p.c) {
      return true;
    }
  }
  return false;
}

/** Stable map key for a board intersection. */
function dotKey(r: number, c: number): string {
  return `${r},${c}`;
}

/** True if `p` lies on the closed segment between `a` and `b` (integer grid). */
function isGridPointOnClosedSegment(p: GridPoint, a: GridPoint, b: GridPoint): boolean {
  if (a.r === b.r && a.c === b.c) {
    return p.r === a.r && p.c === a.c;
  }
  const cross = (b.c - a.c) * (p.r - a.r) - (b.r - a.r) * (p.c - a.c);
  if (cross !== 0) {
    return false;
  }
  return (
    p.r >= Math.min(a.r, b.r) && p.r <= Math.max(a.r, b.r) && p.c >= Math.min(a.c, b.c) && p.c <= Math.max(a.c, b.c)
  );
}

/** True if `p` lies on an edge of the polygon `ring`. */
function isOnPolygonBoundary(p: GridPoint, ring: readonly GridPoint[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    if (isGridPointOnClosedSegment(p, ring[i], ring[(i + 1) % n])) {
      return true;
    }
  }
  return false;
}

/** Dot is strictly inside the polygon: winding contains cell center, not on an edge or vertex. */
function isStrictlyInteriorDot(p: GridPoint, ring: readonly GridPoint[]): boolean {
  if (ring.length < 3) {
    return false;
  }
  if (isRingVertex(p, ring)) {
    return false;
  }
  if (isOnPolygonBoundary(p, ring)) {
    return false;
  }
  return pointInPolygon(p, ring);
}

/**
 * Strictly interior dots: geometric interior (non-zero winding at cell center), excluding boundary lattice points.
 */
function computeInteriorDotKeys(ring: readonly GridPoint[], dotRows: number, dotCols: number): Set<string> {
  const interior = new Set<string>();
  if (ring.length < 3 || dotRows < 1 || dotCols < 1) {
    return interior;
  }

  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      const p: GridPoint = { r, c };
      if (isStrictlyInteriorDot(p, ring)) {
        interior.add(dotKey(r, c));
      }
    }
  }

  return interior;
}

/** True when the dot lies in the strictly interior region of the ring (not on an edge or vertex). */
export function isCapturedByPolygon(
  p: GridPoint,
  ring: readonly GridPoint[],
  dotRows: number,
  dotCols: number
): boolean {
  if (ring.length < 3) {
    return false;
  }
  if (isRingVertex(p, ring)) {
    return false;
  }
  return computeInteriorDotKeys(ring, dotRows, dotCols).has(dotKey(p.r, p.c));
}

export type CaptureResult = Readonly<{
  ring: GridPoint[];
  /** Opponent dots that contribute to score. */
  scoredDots: GridPoint[];
  /** Cells that become blocked (captured area; excludes ring vertices). */
  blockedCells: GridPoint[];
}>;

/**
 * Twice the absolute polygon area in the same y-up Cartesian space as `pointInPolygon`
 * (vertex at (c+0.5, -(r+0.5))). Used only to compare nesting (larger ≈ outer ring).
 */
function polygonDoubledAbsArea(ring: readonly GridPoint[]): number {
  const n = ring.length;
  if (n < 3) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = ring[i].c + 0.5;
    const yi = -(ring[i].r + 0.5);
    const xj = ring[j].c + 0.5;
    const yj = -(ring[j].r + 0.5);
    sum += xi * yj - xj * yi;
  }
  return Math.abs(sum);
}

/** Index of the largest-area polygon whose strict interior contains `key`, or -1. */
function indexOfOutermostPolygonContaining(
  key: string,
  interiorByPoly: readonly Set<string>[],
  doubledArea: readonly number[]
): number {
  let bestIdx = -1;
  let bestArea = -1;
  for (let i = 0; i < interiorByPoly.length; i++) {
    if (!interiorByPoly[i].has(key)) {
      continue;
    }
    const a = doubledArea[i];
    if (a > bestArea || (a === bestArea && (bestIdx === -1 || i < bestIdx))) {
      bestArea = a;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Authoritative scores from the grid and all completed capture rings.
 * Each occupied cell is attributed to the outermost strictly containing polygon (maximum area),
 * so a larger capture supersedes scoring from nested polygons inside it. The polygon owner
 * scores +1 when the cell owner is the opponent.
 */
export function computeScoresFromGridAndPolygons(
  cells: CellState[][],
  polygons: readonly FilledPolygon[]
): Record<PlayerId, number> {
  const scores: Record<PlayerId, number> = { player0: 0, player1: 0 };
  const dotRows = cells.length;
  const dotCols = cells[0]?.length ?? 0;
  if (dotRows < 1 || dotCols < 1 || polygons.length === 0) {
    return scores;
  }

  const interiorByPoly: Set<string>[] = [];
  const doubledArea: number[] = [];
  for (const poly of polygons) {
    interiorByPoly.push(computeInteriorDotKeys(poly.ring, dotRows, dotCols));
    doubledArea.push(polygonDoubledAbsArea(poly.ring));
  }

  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      const cell = cells[r][c];
      if (cell.owner === null) {
        continue;
      }
      const bestIdx = indexOfOutermostPolygonContaining(dotKey(r, c), interiorByPoly, doubledArea);
      if (bestIdx === -1) {
        continue;
      }
      const polyOwner = polygons[bestIdx].owner;
      if (cell.owner !== polyOwner) {
        scores[polyOwner]++;
      }
    }
  }

  return scores;
}

/** Finds opponent dots inside the ring and returns the capture (or null if no score). */
export function computeCapture(
  cells: CellState[][],
  ring: readonly GridPoint[],
  capturer: PlayerId
): CaptureResult | null {
  if (ring.length < 3) {
    return null;
  }
  const dotRows = cells.length;
  const dotCols = cells[0]?.length ?? 0;
  const interiorKeys = computeInteriorDotKeys(ring, dotRows, dotCols);

  const opponent: PlayerId = capturer === "player0" ? "player1" : "player0";
  const scoredDots: GridPoint[] = [];
  const blockedCells: GridPoint[] = [];

  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      if (!interiorKeys.has(dotKey(r, c))) {
        continue;
      }
      const p: GridPoint = { r, c };
      const cell = cells[r][c];
      blockedCells.push(p);
      if (cell.owner === opponent) {
        scoredDots.push(p);
      }
    }
  }

  if (scoredDots.length === 0) {
    return null;
  }

  return { ring: [...ring], scoredDots, blockedCells };
}

/** Marks all cells inside the capture as blocked (including empty intersections). */
export function applyCapture(grid: CellState[][], capture: CaptureResult): CellState[][] {
  const next = cloneGrid(grid);
  for (const { r, c } of capture.blockedCells) {
    const cell = next[r][c];
    next[r][c] = { owner: cell.owner, blocked: true };
  }
  return next;
}
