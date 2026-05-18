import type { Response as ExpressResponse } from "express";

import { leaveRoom } from "../../../../roomService.js";
import { roomIdParam } from "../../../../dotsRequest.js";
import type { DotsRequest } from "../../../../types.js";

/** Leaves a dots room. */
export async function postLeave(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    return;
  }
  await leaveRoom(req.dotsUser.id, roomIdParam(req));
  res.status(204).end();
}
