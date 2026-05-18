import { DotsRoomMemberRole, DotsRoomStatus, type Prisma } from "@prisma/client";

/** Room statuses that block duplicate active membership. */
export const ACTIVE_STATUSES: DotsRoomStatus[] = [DotsRoomStatus.WAITING, DotsRoomStatus.PLAYING];

/** Member roles counted as in-game players. */
export const PLAYER_ROLES: DotsRoomMemberRole[] = [DotsRoomMemberRole.PLAYER0, DotsRoomMemberRole.PLAYER1];

/** Prisma include shape for rooms with members and owner. */
export const roomWithMembers = {
  include: {
    members: { include: { user: { select: { id: true, displayName: true } } } },
    owner: { select: { id: true, displayName: true } }
  }
} satisfies Prisma.DotsRoomDefaultArgs;

export type RoomWithMembers = Prisma.DotsRoomGetPayload<typeof roomWithMembers>;
