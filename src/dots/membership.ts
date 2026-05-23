import { DotsRoomMemberRole, DotsRoomStatus } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { DotsApiError } from "./errors.js";
import { ACTIVE_STATUSES, PLAYER_ROLES, type RoomWithMembers } from "./membershipConsts.js";
import type { DotsSessionActiveRoom } from "./wireTypes.js";

/** Maps a locked player user id to the corresponding member role. */
export function lockedPlayerRole(room: RoomWithMembers, userId: string): DotsRoomMemberRole | null {
  if (room.lockedPlayer0UserId === userId) {
    return DotsRoomMemberRole.PLAYER0;
  }
  if (room.lockedPlayer1UserId === userId) {
    return DotsRoomMemberRole.PLAYER1;
  }
  return null;
}

/** Ensures a locked player has the correct PLAYER membership during an active game. */
export async function ensureLockedPlayerMembership(
  room: RoomWithMembers,
  roomId: string,
  userId: string
): Promise<void> {
  if (room.status !== DotsRoomStatus.PLAYING) {
    return;
  }
  const role = lockedPlayerRole(room, userId);
  if (!role) {
    return;
  }
  const existing = room.members.find((member) => member.userId === userId);
  if (existing?.role === role) {
    return;
  }
  if (existing) {
    await prisma.dotsRoomMember.updateMany({
      where: { roomId, userId },
      data: { role }
    });
    return;
  }
  await prisma.dotsRoomMember.create({ data: { roomId, userId, role } });
}

/** Removes PLAYER memberships for both locked players when a game ends. */
export async function releaseLockedPlayerMemberships(room: RoomWithMembers, roomId: string): Promise<void> {
  const lockedIds = [room.lockedPlayer0UserId, room.lockedPlayer1UserId].filter((id): id is string => id !== null);
  if (lockedIds.length === 0) {
    return;
  }
  await prisma.dotsRoomMember.deleteMany({
    where: {
      roomId,
      userId: { in: lockedIds },
      role: { in: PLAYER_ROLES }
    }
  });
}

/** Returns the user's in-progress game room, if any. */
export async function findActivePlayingRoom(userId: string): Promise<DotsSessionActiveRoom | null> {
  const asLocked = await prisma.dotsRoom.findFirst({
    where: {
      status: DotsRoomStatus.PLAYING,
      OR: [{ lockedPlayer0UserId: userId }, { lockedPlayer1UserId: userId }]
    },
    select: { id: true, status: true }
  });
  if (asLocked) {
    return { id: asLocked.id, status: "playing" };
  }
  return null;
}

/** True when the user owns or plays in a waiting/playing room. */
export async function hasBlockingMembership(userId: string): Promise<boolean> {
  const owned = await prisma.dotsRoom.count({
    where: { ownerUserId: userId, status: { in: ACTIVE_STATUSES } }
  });
  if (owned > 0) {
    return true;
  }
  const asPlayer = await prisma.dotsRoomMember.count({
    where: {
      userId,
      role: { in: PLAYER_ROLES },
      room: { status: { in: ACTIVE_STATUSES } }
    }
  });
  if (asPlayer > 0) {
    return true;
  }
  const asLocked = await prisma.dotsRoom.count({
    where: {
      status: DotsRoomStatus.PLAYING,
      OR: [{ lockedPlayer0UserId: userId }, { lockedPlayer1UserId: userId }]
    }
  });
  return asLocked > 0;
}

/** Throws when the user is blocked by an active room membership. */
export async function assertNotBlocked(userId: string): Promise<void> {
  if (await hasBlockingMembership(userId)) {
    throw new DotsApiError(409, "dotsActiveRoomBlocked");
  }
}
