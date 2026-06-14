import type { Response as ExpressResponse } from "express";

import { markChatRead } from "../../../../../chatService.js";
import { roomIdParam } from "../../../../../dotsRequest.js";
import type { DotsRequest } from "../../../../../wireTypes.js";

type PostReadBody = Readonly<{
  lastReadAtMs?: unknown;
}>;

/** Marks chat messages as read up to the given timestamp. */
export async function postRead(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const body = req.body as PostReadBody;
  const lastReadAtMs = typeof body.lastReadAtMs === "number" ? body.lastReadAtMs : Number(body.lastReadAtMs);
  await markChatRead(roomIdParam(req), req.dotsUser!.id, lastReadAtMs);
  res.status(204).send();
}
