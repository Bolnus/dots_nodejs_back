import type { GridPoint } from "../game-synced/types.js";

export type DotsLocalMode = "play" | "drawPolygon";

export type DotsLocalState = Readonly<{
  mode: DotsLocalMode;
  pendingDot: GridPoint | null;
  chainStart: GridPoint | null;
  chainPath: GridPoint[];
}>;
