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
