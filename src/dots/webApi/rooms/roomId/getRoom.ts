import type { Response as ExpressResponse } from "express";

import { getRoom } from "../../../roomService.js";
import { roomIdParam } from "../../../dotsRequest.js";
import type { DotsRequest } from "../../../wireTypes.js";

/** Returns a single dots room by id. */
export async function getRoomById(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const room = await getRoom(roomIdParam(req));
  res.json(room);
}
