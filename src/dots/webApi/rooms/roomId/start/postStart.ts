import type { Response as ExpressResponse } from "express";

import { startGame } from "../../../../roomService.js";
import { roomIdParam } from "../../../../dotsRequest.js";
import type { DotsRequest } from "../../../../types.js";

/** Starts a game in a waiting room with two players. */
export async function postStart(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    return;
  }
  const room = await startGame(req.dotsUser.id, roomIdParam(req));
  res.json(room);
}
