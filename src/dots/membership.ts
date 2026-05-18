import { prisma } from "../db/prisma.js";
import { DotsApiError } from "./errors.js";
import { ACTIVE_STATUSES, PLAYER_ROLES } from "./membershipConsts.js";

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
    throw new DotsApiError(409, "dotsActiveRoomBlocked");
  }
}
