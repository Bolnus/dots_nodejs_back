import { DotsRoomStatus } from "@prisma/client";
import type { Response as ExpressResponse } from "express";

import { prisma } from "../../../../../db/prisma.js";
import { roomIdParam } from "../../../../dotsRequest.js";
import { mapRoomToDetail } from "../../../../roomMapper.js";
import { loadRoom, saveAndBroadcast } from "../../../../roomService.js";
import { broadcastRoomEvent } from "../../../../events.js";
import type { DotsRequest } from "../../../../wireTypes.js";

/** Removes a user from a room; owners delete waiting rooms. Playing rooms are left unchanged. */
async function leaveRoom(userId: string, roomId: string): Promise<void> {
  const room = await loadRoom(roomId);

  if (room.status === DotsRoomStatus.PLAYING) {
    return;
  }

  if (room.status === DotsRoomStatus.FINISHED) {
    await prisma.dotsRoomMember.deleteMany({ where: { roomId, userId } });
    await saveAndBroadcast(roomId, {}, "STATE_DELTA");
    return;
  }

  if (room.ownerUserId === userId) {
    const snapshot = mapRoomToDetail({ ...room, status: DotsRoomStatus.FINISHED });
    await prisma.dotsRoom.delete({ where: { id: roomId } });
    broadcastRoomEvent(roomId, { type: "STATE_DELTA", room: snapshot });
    return;
  }

  await prisma.dotsRoomMember.deleteMany({ where: { roomId, userId } });
  await saveAndBroadcast(roomId, {}, "STATE_DELTA");
}

/** Leaves a dots room. */
export async function postLeave(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    return;
  }
  await leaveRoom(req.dotsUser.id, roomIdParam(req));
  res.status(204).end();
}
