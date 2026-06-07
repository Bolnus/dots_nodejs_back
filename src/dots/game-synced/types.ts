export type PlayerId = "player0" | "player1";

export type GridPoint = Readonly<{
  r: number;
  c: number;
}>;

export type CellState = Readonly<{
  owner: PlayerId | null;
  blocked: boolean;
}>;

export type FilledPolygon = Readonly<{
  owner: PlayerId;
  ring: GridPoint[];
}>;

export type DotsBoardConfig = Readonly<{
  rows: number;
  cols: number;
}>;

export type DotsGameConfig = Readonly<{
  rows: number;
  cols: number;
  cellSizePx?: number;
}>;

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

/** Discriminated union of committed actions accepted by the server reducer. */
export type DotsServerAction =
  | Readonly<{ type: "COMMIT_PLACEMENT"; point: GridPoint; by: PlayerId }>
  | Readonly<{ type: "COMMIT_CAPTURE"; ring: GridPoint[]; by: PlayerId }>
  | Readonly<{ type: "SURRENDER"; by: PlayerId }>;

/** Why `reduceServer` left state unchanged for a committed action. */
export type ReduceServerRejectReason =
  | "gameNotInPlay"
  | "notYourTurn"
  | "placementPointOutOfBounds"
  | "placementCellBlocked"
  | "placementCellOccupied"
  | "captureRingTooShort"
  | "invalidCaptureStarter"
  | "captureRingVerticesInvalid"
  | "captureRingNotConnected"
  | "invalidCapture";

/** Outcome of applying one committed action to authoritative server state. */
export type ReduceServerResult =
  | Readonly<{ ok: true; state: DotsServerGameState }>
  | Readonly<{ ok: false; reason: ReduceServerRejectReason; state: DotsServerGameState }>;
