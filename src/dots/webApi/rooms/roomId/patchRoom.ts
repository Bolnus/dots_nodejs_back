import type { Response as ExpressResponse } from "express";

import { patchRoom } from "../../../roomService.js";
import { roomIdParam } from "../../../dotsRequest.js";
import type { DotsRequest } from "../../../types.js";

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
