import { DotsRoomStatus } from "@prisma/client";
import type { Response as ExpressResponse } from "express";

import { prisma } from "../../../../db/prisma.js";
import { hashPassword } from "../../../auth.js";
import { DotsApiError } from "../../../errors.js";
import { roomIdParam } from "../../../dotsRequest.js";
import { loadRoom, saveAndBroadcast, validateBoard } from "../../../roomService.js";
import type { DotsBoardConfig, DotsRequest, DotsRoomDetail } from "../../../wireTypes.js";

/** Patches room settings (owner, waiting only). */
async function patchRoom(
  userId: string,
  roomId: string,
  body: Readonly<{ config?: DotsBoardConfig; isPrivate?: boolean; password?: string; kickUserId?: string }>
): Promise<DotsRoomDetail> {
  const room = await loadRoom(roomId);
  if (room.ownerUserId !== userId) {
    throw new DotsApiError(403, "dotsOwnerOnly");
  }
  if (room.status !== DotsRoomStatus.WAITING) {
    throw new DotsApiError(409, "dotsSettingsLocked");
  }

  const data: Parameters<typeof prisma.dotsRoom.update>[0]["data"] = {};
  if (body.config !== undefined) {
    validateBoard(body.config);
    data.rows = body.config.rows;
    data.cols = body.config.cols;
  }
  if (body.isPrivate !== undefined) {
    data.isPrivate = body.isPrivate;
  }
  if (body.password !== undefined) {
    data.passwordHash = body.password === "" ? null : hashPassword(body.password);
  }
  if (body.kickUserId !== undefined && body.kickUserId !== room.ownerUserId) {
    await prisma.dotsRoomMember.deleteMany({
      where: { roomId, userId: body.kickUserId }
    });
  }

  return saveAndBroadcast(roomId, data, "STATE_DELTA");
}

/** Updates room settings or kicks a member. */
export async function patchRoomById(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const body = req.body as {
    config?: { rows?: number; cols?: number };
    isPrivate?: boolean;
    password?: string;
    kickUserId?: string;
  };
  if (!req.dotsUser) {
    return;
  }
  const room = await patchRoom(req.dotsUser.id, roomIdParam(req), {
    config: body.config ? { rows: body.config.rows ?? 0, cols: body.config.cols ?? 0 } : undefined,
    isPrivate: body.isPrivate,
    password: body.password,
    kickUserId: body.kickUserId
  });
  res.json(room);
}
