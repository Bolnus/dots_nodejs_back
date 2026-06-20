import type { Response as ExpressResponse } from "express";

import { prisma } from "../../../db/prisma.js";
import { roomWithMembers } from "../../membershipConsts.js";
import { mapRoomToSummary } from "../../roomMapper.js";
import type { DotsRequest, DotsRoomSummary } from "../../wireTypes.js";

/** Returns summaries for all rooms. */
async function listRooms(): Promise<DotsRoomSummary[]> {
  const rooms = await prisma.dotsRoom.findMany({
    orderBy: { createdAt: "desc" },
    ...roomWithMembers
  });
  return rooms.map((room) => mapRoomToSummary(room)).filter((summary): summary is DotsRoomSummary => summary !== null);
}

/** Lists all dots rooms. */
export async function getRooms(_req: DotsRequest, res: ExpressResponse): Promise<void> {
  const rooms = await listRooms();
  res.json(rooms);
}
