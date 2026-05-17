import { createEmptyGrid } from "./logic.js";
import type { CellState, FilledPolygon, PlayerId } from "./types.js";
import { fnv1a32Hex } from "./fnv1a.js";
import type { DotsBoardConfig } from "./types.js";

/** Authoritative server-side play mode (no client-only draw mode). */
export type DotsServerMode = "play" | "ended";

/** Authoritative dots game state owned by the server (excludes any in-flight local UI). */
export type DotsServerGameState = Readonly<{
  config: DotsBoardConfig;
  cells: CellState[][];
  /** Number of committed dot placements (drives whose turn is next). */
  dotsPlacedCount: number;
  scores: Readonly<Record<PlayerId, number>>;
  mode: DotsServerMode;
  winner: PlayerId | null;
  surrenderedBy: PlayerId | null;
  polygons: FilledPolygon[];
  /** Monotonic counter; clients drop out-of-order deltas. */
  version: number;
  /** Deterministic checksum of the canonical projection of this state. */
  hash: string;
}>;

/** Canonical, stable string projection of a server state used for the checksum. */
export function canonicalizeServerState(state: Omit<DotsServerGameState, "hash">): string {
  const cellRows = state.cells.map((row) =>
    row.map((cell: CellState) => `${cell.owner ?? "_"}${cell.blocked ? "1" : "0"}`).join(",")
  );
  const polygons = state.polygons.map((poly) => ({
    owner: poly.owner,
    ring: poly.ring.map((p) => [p.r, p.c])
  }));
  const projection = {
    config: { rows: state.config.rows, cols: state.config.cols },
    cells: cellRows,
    dotsPlacedCount: state.dotsPlacedCount,
    scores: { player0: state.scores.player0, player1: state.scores.player1 },
    mode: state.mode,
    winner: state.winner,
    surrenderedBy: state.surrenderedBy,
    polygons,
    version: state.version
  };
  return JSON.stringify(projection);
}

/** Recomputes the deterministic 32-bit checksum for a server state snapshot. */
export function computeServerStateHash(state: Omit<DotsServerGameState, "hash">): string {
  return fnv1a32Hex(canonicalizeServerState(state));
}

/** Initial authoritative state for a new room game with the given board config. */
export function initialServerStateFromConfig(config: DotsBoardConfig): DotsServerGameState {
  const base: Omit<DotsServerGameState, "hash"> = {
    config,
    cells: createEmptyGrid(config),
    dotsPlacedCount: 0,
    scores: { player0: 0, player1: 0 },
    mode: "play",
    winner: null,
    surrenderedBy: null,
    polygons: [],
    version: 0
  };
  return { ...base, hash: computeServerStateHash(base) };
}
