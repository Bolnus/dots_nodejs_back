import { DotsRoomMemberRole, DotsRoomStatus } from "@prisma/client";
import type { Response as ExpressResponse } from "express";

import { prisma } from "../../../../../db/prisma.js";
import { verifyPassword } from "../../../../auth.js";
import { DotsApiError } from "../../../../errors.js";
import { roomIdParam } from "../../../../dotsRequest.js";
import { MAX_PLAYERS } from "../../../../consts.js";
import { ensureLockedPlayerMembership, lockedPlayerRole } from "../../../../membership.js";
import type { RoomWithMembers } from "../../../../membershipConsts.js";
import { loadRoom, saveAndBroadcast } from "../../../../roomService.js";
import type { DotsRequest, DotsRoomDetail } from "../../../../wireTypes.js";

/** Adds a user to a waiting or playing room with the correct role. */
async function addNewRoomMember(
  room: RoomWithMembers,
  roomId: string,
  userId: string,
  asViewer: boolean | undefined
): Promise<void> {
  if (room.status === DotsRoomStatus.PLAYING) {
    const lockedRole = lockedPlayerRole(room, userId);
    if (lockedRole) {
      await prisma.dotsRoomMember.create({ data: { roomId, userId, role: lockedRole } });
      return;
    }
    if (asViewer !== true) {
      throw new DotsApiError(409, "dotsPlayingLocked");
    }
    await prisma.dotsRoomMember.create({
      data: { roomId, userId, role: DotsRoomMemberRole.VIEWER }
    });
    return;
  }

  const wantsViewer = asViewer === true;
  const playerCount = room.members.filter(
    (member) => member.role === DotsRoomMemberRole.PLAYER0 || member.role === DotsRoomMemberRole.PLAYER1
  ).length;
  if (!wantsViewer && playerCount < MAX_PLAYERS) {
    const role =
      playerCount === 0 || !room.members.some((member) => member.role === DotsRoomMemberRole.PLAYER0)
        ? DotsRoomMemberRole.PLAYER0
        : DotsRoomMemberRole.PLAYER1;
    await prisma.dotsRoomMember.create({ data: { roomId, userId, role } });
    return;
  }

  await prisma.dotsRoomMember.create({
    data: { roomId, userId, role: DotsRoomMemberRole.VIEWER }
  });
}

/** Joins a room as player or viewer. */
async function joinRoom(
  userId: string,
  roomId: string,
  body: Readonly<{ password?: string; asViewer?: boolean }>
): Promise<DotsRoomDetail> {
  const room = await loadRoom(roomId);
  if (!verifyPassword(body.password ?? "", room.passwordHash)) {
    throw new DotsApiError(403, "dotsWrongPassword");
  }

  const already = room.members.some((member) => member.userId === userId);
  if (!already) {
    await addNewRoomMember(room, roomId, userId, body.asViewer);
  } else {
    await ensureLockedPlayerMembership(room, roomId, userId);
  }

  return saveAndBroadcast(roomId, {}, "STATE_DELTA");
}

/** Joins a dots room as a player or viewer. */
export async function postJoin(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const body = req.body as { password?: string; asViewer?: boolean };
  if (!req.dotsUser) {
    return;
  }
  const room = await joinRoom(req.dotsUser.id, roomIdParam(req), body);
  res.json(room);
}
