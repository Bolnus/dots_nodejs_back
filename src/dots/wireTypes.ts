import type { Request as ExpressRequest } from "express";

import type { en } from "../locales/en.js";
import type { DotsLocalState } from "./localStateWire.js";
import type { DotsServerGameState, PlayerId, ReduceServerRejectReason } from "./game-synced/types.js";

/** Authenticated dots user attached to API requests. */
export type AuthUser = Readonly<{
  id: string;
  displayName: string;
}>;

/** Express request extended with dots auth and locale. */
export type DotsRequest = ExpressRequest & {
  dotsUser?: AuthUser;
  languageCode?: string;
};

export type DotsErrorCode = keyof Pick<
  typeof en,
  | "dotsNameTaken"
  | "dotsActiveRoomBlocked"
  | "dotsMaxRooms"
  | "dotsInvalidGrid"
  | "dotsRoomNotFound"
  | "dotsWrongPassword"
  | "dotsOwnerOnly"
  | "dotsSettingsLocked"
  | "dotsNeedTwoPlayers"
  | "dotsRoomFull"
  | "dotsPlayingLocked"
  | "dotsUnauthorized"
  | "dotsNotInGame"
  | "dotsInternal"
  | "dotsAiSlotTaken"
  | "dotsAiNotPresent"
  | "dotsLlmUnavailable"
  | "dotsNotInRoom"
  | "dotsChatMessageEmpty"
  | "dotsChatMessageTooLong"
  | "dotsChatRateLimited"
>;

export type DotsRoomStatus = "waiting" | "playing" | "finished";

export type DotsBoardConfig = Readonly<{ rows: number; cols: number }>;

export type DotsOnlineUser = Readonly<{ userId: string; displayName: string; isAi?: boolean }>;

export type DotsChatSenderKind = "ai" | "player" | "viewer";

export type DotsChatMessage = Readonly<{
  id: string;
  senderKind: DotsChatSenderKind;
  senderUserId: string | null;
  senderDisplayName: string | null;
  content: string;
  createdAtMs: number;
}>;

export type AddAiResult = Readonly<{
  modelName: string;
  room: DotsRoomDetail;
}>;

export type DotsChatReadState = Readonly<{
  userId: string;
  lastReadAtMs: number;
}>;

export type ListChatMessagesResult = Readonly<{
  messages: readonly DotsChatMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  readStates: readonly DotsChatReadState[];
}>;

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

export type DotsLockedPlayers = Readonly<{
  player0: string | null;
  player1: string | null;
}>;

export type DotsSessionActiveRoom = Readonly<{
  id: string;
  status: DotsRoomStatus;
}>;

export type HeartbeatResult = Readonly<{
  activeRoom: DotsSessionActiveRoom | null;
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
  lockedPlayers: DotsLockedPlayers;
  connectedUserIds: readonly string[];
  createdAtMs: number;
}>;

export type DotsRoomEvent =
  | Readonly<{ type: "ROOM_STATE"; room: DotsRoomDetail }>
  | Readonly<{ type: "STATE_DELTA"; room: DotsRoomDetail }>
  | Readonly<{ type: "PRESENCE_DELTA"; room: DotsRoomDetail }>
  | Readonly<{ type: "CHAT_MESSAGE"; roomId: string; message: DotsChatMessage }>
  | Readonly<{ type: "CHAT_READ"; roomId: string; userId: string; lastReadAtMs: number }>
  | Readonly<{ type: "CHAT_TYPING"; roomId: string; userId: string; displayName: string }>;

export type CommitRejectReason = "prevHash" | "badHash" | "notAuthorized" | "notInGame" | ReduceServerRejectReason;

export type CommitActionResult =
  | Readonly<{ status: "ok" }>
  | Readonly<{
      status: "rejected";
      reason: CommitRejectReason;
      /** Localized rejection text (`Accept-Language`). */
      messageLocal: string;
      snapshot: DotsRoomDetail;
    }>;
