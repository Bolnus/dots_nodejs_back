import { DotsRoomMemberRole, DotsRoomStatus } from "@prisma/client";
import type { Response as ExpressResponse } from "express";

import { DOTS_MAX_ACTIVE_ROOMS } from "../../../config.js";
import { prisma } from "../../../db/prisma.js";
import { assertNotBlocked } from "../../membership.js";
import { roomWithMembers } from "../../membershipConsts.js";
import { hashPassword } from "../../auth.js";
import { mapRoomToDetail } from "../../roomMapper.js";
import { validateBoard } from "../../roomService.js";
import { DotsApiError, sendDotsError } from "../../errors.js";
import { broadcastRoomEvent } from "../../events.js";
import type { DotsBoardConfig, DotsRequest, DotsRoomDetail } from "../../wireTypes.js";

/** Ensures the global active room cap has not been reached. */
async function assertActiveRoomCap(): Promise<void> {
  const count = await prisma.dotsRoom.count({
    where: { status: { in: [DotsRoomStatus.WAITING, DotsRoomStatus.PLAYING] } }
  });
  if (count >= DOTS_MAX_ACTIVE_ROOMS) {
    throw new DotsApiError(409, "dotsMaxRooms", { max: String(DOTS_MAX_ACTIVE_ROOMS) });
  }
}

/** Deletes rooms older than one day before creating a new room. */
async function purgeOldRooms(): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.dotsRoom.deleteMany({
    where: { createdAt: { lt: oneDayAgo } }
  });
}

/** Creates a new waiting room owned by the authenticated user. */
async function createRoom(
  userId: string,
  body: Readonly<{ name: string; config: DotsBoardConfig; isPrivate: boolean; password?: string }>
): Promise<DotsRoomDetail> {
  await assertNotBlocked(userId);
  await assertActiveRoomCap();
  await purgeOldRooms();
  validateBoard(body.config);

  const passwordHash = body.isPrivate && body.password && body.password.length > 0 ? hashPassword(body.password) : null;

  const room = await prisma.dotsRoom.create({
    data: {
      name: body.name.trim() || "Room",
      ownerUserId: userId,
      status: DotsRoomStatus.WAITING,
      isPrivate: body.isPrivate,
      passwordHash,
      rows: body.config.rows,
      cols: body.config.cols,
      members: {
        create: {
          userId,
          role: DotsRoomMemberRole.PLAYER0
        }
      }
    },
    ...roomWithMembers
  });

  const detail = mapRoomToDetail(room);
  broadcastRoomEvent(room.id, { type: "ROOM_STATE", room: detail });
  return detail;
}

/** Creates a new dots room owned by the authenticated user. */
export async function postRoom(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const body = req.body as {
    name?: string;
    config?: { rows?: number; cols?: number };
    isPrivate?: boolean;
    password?: string;
  };
  if (!req.dotsUser || !body.config) {
    sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
    return;
  }
  const room = await createRoom(req.dotsUser.id, {
    name: body.name ?? "",
    config: { rows: body.config.rows ?? 0, cols: body.config.cols ?? 0 },
    isPrivate: Boolean(body.isPrivate),
    password: body.password
  });
  res.status(201).json(room);
}
