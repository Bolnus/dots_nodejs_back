import { DotsRoomMemberRole, DotsRoomStatus } from "@prisma/client";

import type { DotsServerGameState } from "./game-synced/types.js";
import type { PlayerId } from "./game-synced/types.js";
import { MAX_PLAYERS } from "./consts.js";
import type { DotsLocalState } from "./localStateWire.js";
import type { RoomWithMembers } from "./membershipConsts.js";
import { getConnectedUserIds } from "./roomConnections.js";
import type {
  DotsOnlineUser,
  DotsRoomDetail,
  DotsRoomPlayer,
  DotsRoomStatus as WireStatus,
  DotsRoomSummary
} from "./wireTypes.js";

/** Maps a Prisma room status to the wire enum. */
function toWireStatus(status: DotsRoomStatus): WireStatus {
  switch (status) {
    case DotsRoomStatus.WAITING:
      return "waiting";
    case DotsRoomStatus.PLAYING:
      return "playing";
    case DotsRoomStatus.FINISHED:
      return "finished";
    default:
      return "finished";
  }
}

/** Maps a member role to a player slot, or null for viewers. */
function roleToSlot(role: DotsRoomMemberRole): PlayerId | null {
  if (role === DotsRoomMemberRole.PLAYER0) {
    return "player0";
  }
  if (role === DotsRoomMemberRole.PLAYER1) {
    return "player1";
  }
  return null;
}

/** Maps a Prisma room row to the full wire detail shape. */
export function mapRoomToDetail(room: RoomWithMembers): DotsRoomDetail {
  const players: DotsRoomPlayer[] = [];
  const viewers: DotsOnlineUser[] = [];
  for (const member of room.members) {
    const slot = roleToSlot(member.role);
    const user = { userId: member.user.id, displayName: member.user.displayName };
    if (slot) {
      players.push({ slot, user });
    } else {
      viewers.push(user);
    }
  }
  players.sort((a, b) => a.slot.localeCompare(b.slot));

  return {
    id: room.id,
    name: room.name,
    ownerUserId: room.ownerUserId,
    isPrivate: room.isPrivate,
    hasPassword: room.passwordHash !== null,
    status: toWireStatus(room.status),
    players,
    viewers,
    config: { rows: room.rows, cols: room.cols },
    serverState: room.serverState as DotsServerGameState | null,
    presence: room.presence as DotsLocalState | null,
    presenceBy: room.presenceByUserId,
    lockedPlayers: {
      player0: room.lockedPlayer0UserId,
      player1: room.lockedPlayer1UserId
    },
    connectedUserIds: getConnectedUserIds(room.id),
    createdAtMs: room.createdAt.getTime()
  };
}

/** Maps a Prisma room row to the list summary shape. */
export function mapRoomToSummary(room: RoomWithMembers): DotsRoomSummary {
  const detail = mapRoomToDetail(room);
  const ownerName =
    room.members.find((m) => m.user.id === room.ownerUserId)?.user.displayName ?? room.owner.displayName;
  return {
    id: detail.id,
    name: detail.name,
    ownerUserId: detail.ownerUserId,
    ownerName,
    isPrivate: detail.isPrivate,
    hasPassword: detail.hasPassword,
    config: detail.config,
    status: detail.status,
    playerCount: detail.players.length,
    maxPlayers: MAX_PLAYERS,
    viewerCount: detail.viewers.length,
    createdAtMs: detail.createdAtMs
  };
}
