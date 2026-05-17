import { DotsRoomMemberRole, DotsRoomStatus, type Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";

const ACTIVE_STATUSES: DotsRoomStatus[] = [DotsRoomStatus.WAITING, DotsRoomStatus.PLAYING];
const PLAYER_ROLES: DotsRoomMemberRole[] = [DotsRoomMemberRole.PLAYER0, DotsRoomMemberRole.PLAYER1];

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
  return asPlayer > 0;
}

/** Throws when the user is blocked by an active room membership. */
export async function assertNotBlocked(userId: string): Promise<void> {
  if (await hasBlockingMembership(userId)) {
    throw new Error("blocked");
  }
}

export const roomWithMembers = {
  include: {
    members: { include: { user: { select: { id: true, displayName: true } } } },
    owner: { select: { id: true, displayName: true } }
  }
} satisfies Prisma.DotsRoomDefaultArgs;

export type RoomWithMembers = Prisma.DotsRoomGetPayload<typeof roomWithMembers>;
