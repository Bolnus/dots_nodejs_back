import { DotsRoomMemberRole, DotsRoomStatus } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { currentServerPlacingPlayer } from "./game-synced/serverReducer.js";
import type { DotsServerGameState } from "./game-synced/types.js";
import { DOTS_GRID_MAX, DOTS_GRID_MIN } from "./game-synced/consts.js";
import { isValidGridDimension } from "./game-synced/logic.js";
import type { PlayerId } from "./game-synced/types.js";
import { roomWithMembers, type RoomWithMembers } from "./membershipConsts.js";
import { mapRoomToDetail } from "./roomMapper.js";
import { DotsApiError } from "./errors.js";
import type { DotsBoardConfig, DotsRoomDetail } from "./wireTypes.js";
import type { DotsLocalState } from "./localStateWire.js";
import { broadcastRoomEvent } from "./events.js";

/** Loads a room with members or throws when missing. */
export async function loadRoom(roomId: string): Promise<RoomWithMembers> {
  const room = await prisma.dotsRoom.findUnique({
    where: { id: roomId },
    ...roomWithMembers
  });
  if (!room) {
    throw new DotsApiError(404, "dotsRoomNotFound");
  }
  return room;
}

/** Validates board dimensions against game rules. */
export function validateBoard(config: DotsBoardConfig): void {
  if (!isValidGridDimension(config.rows) || !isValidGridDimension(config.cols)) {
    throw new DotsApiError(400, "dotsInvalidGrid", {
      min: String(DOTS_GRID_MIN),
      max: String(DOTS_GRID_MAX)
    });
  }
}

/** Returns the player slot for a user in the room, if any. */
function findPlayerSlot(room: RoomWithMembers, userId: string): PlayerId | null {
  for (const member of room.members) {
    if (member.userId !== userId) {
      continue;
    }
    if (member.role === DotsRoomMemberRole.PLAYER0) {
      return "player0";
    }
    if (member.role === DotsRoomMemberRole.PLAYER1) {
      return "player1";
    }
  }
  return null;
}

/** True when it is this user's turn to commit or send presence. */
export function isActingPlayer(room: RoomWithMembers, userId: string): boolean {
  const state = room.serverState as DotsServerGameState | null;
  if (!state || state.mode !== "play") {
    return false;
  }
  const slot = findPlayerSlot(room, userId);
  if (!slot) {
    return false;
  }
  if (
    room.status === DotsRoomStatus.PLAYING &&
    userId !== room.lockedPlayer0UserId &&
    userId !== room.lockedPlayer1UserId
  ) {
    return false;
  }
  return slot === currentServerPlacingPlayer(state);
}

/** Persists room changes and broadcasts a realtime event. */
export async function saveAndBroadcast(
  roomId: string,
  data: Parameters<typeof prisma.dotsRoom.update>[0]["data"],
  eventType: "ROOM_STATE" | "STATE_DELTA" | "PRESENCE_DELTA"
): Promise<DotsRoomDetail> {
  const updated = await prisma.dotsRoom.update({
    where: { id: roomId },
    data,
    ...roomWithMembers
  });
  const detail = mapRoomToDetail(updated);
  broadcastRoomEvent(roomId, { type: eventType, room: detail });
  return detail;
}

/** Returns full detail for one room. */
export async function getRoom(roomId: string): Promise<DotsRoomDetail> {
  return mapRoomToDetail(await loadRoom(roomId));
}

/** Stores and broadcasts ephemeral in-flight UI state. */
export async function applyEphemeral(userId: string, roomId: string, patch: DotsLocalState): Promise<void> {
  const room = await loadRoom(roomId);
  if (!room.serverState || room.status !== DotsRoomStatus.PLAYING) {
    return;
  }
  if (!isActingPlayer(room, userId)) {
    return;
  }
  await saveAndBroadcast(
    roomId,
    {
      presence: patch,
      presenceByUserId: userId
    },
    "PRESENCE_DELTA"
  );
}
