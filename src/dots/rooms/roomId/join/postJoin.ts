import type { Response as ExpressResponse } from "express";

import { joinRoom } from "../../../roomService.js";
import { roomIdParam } from "../../../http/dotsRequest.js";
import type { DotsRequest } from "../../../types.js";

/** Joins a dots room as a player or viewer. */
export async function postJoin(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const body = req.body as { password?: string; asViewer?: boolean };
  if (!req.dotsUser) {
    return;
  }
  const room = await joinRoom(req.dotsUser.id, req.dotsUser.displayName, roomIdParam(req), body);
  res.json(room);
}
