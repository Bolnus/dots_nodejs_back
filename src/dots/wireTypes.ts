import type { DotsLocalState } from "./localStateWire.js";
import type { DotsServerGameState } from "./game-synced/types.js";
import type { PlayerId } from "./game-synced/types.js";

export type DotsRoomStatus = "waiting" | "playing" | "finished";

export type DotsBoardConfig = Readonly<{ rows: number; cols: number }>;

export type DotsOnlineUser = Readonly<{ userId: string; displayName: string }>;

export type DotsRoomPlayer = Readonly<{ slot: PlayerId; user: DotsOnlineUser }>;

export type DotsRoomSummary = Readonly<{
  id: string;
  name: string;
  ownerUserId: string;
  ownerName: string;
  isPrivate: boolean;
  hasPassword: boolean;
  config: DotsBoardConfig;
  status: DotsRoomStatus;
  playerCount: number;
  maxPlayers: number;
  viewerCount: number;
  createdAtMs: number;
}>;

export type DotsRoomDetail = Readonly<{
  id: string;
  name: string;
  ownerUserId: string;
  isPrivate: boolean;
  hasPassword: boolean;
  status: DotsRoomStatus;
  players: readonly DotsRoomPlayer[];
  viewers: readonly DotsOnlineUser[];
  config: DotsBoardConfig;
  serverState: DotsServerGameState | null;
  presence: DotsLocalState | null;
  presenceBy: string | null;
  createdAtMs: number;
}>;

export type DotsRoomEvent =
  | Readonly<{ type: "ROOM_STATE"; room: DotsRoomDetail }>
  | Readonly<{ type: "STATE_DELTA"; room: DotsRoomDetail }>
  | Readonly<{ type: "PRESENCE_DELTA"; room: DotsRoomDetail }>;

export type CommitRejectReason = "prevHash" | "badHash" | "notAuthorized" | "notInGame";

export type CommitActionResult =
  | Readonly<{ status: "ok" }>
  | Readonly<{ status: "rejected"; reason: CommitRejectReason; snapshot: DotsRoomDetail }>;
