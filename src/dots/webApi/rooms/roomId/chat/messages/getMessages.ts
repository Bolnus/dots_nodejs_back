import type { Response as ExpressResponse } from "express";

import { parseOptionalInt } from "../../../../../../commonWebApi/queryUtils.js";
import { listChatMessages } from "../../../../../chatService.js";
import { roomIdParam } from "../../../../../dotsRequest.js";
import type { DotsRequest } from "../../../../../wireTypes.js";

/** Returns paginated chat messages for a room member. */
export async function getMessages(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const afterMs = parseOptionalInt(req.query.afterMs);
  const limit = parseOptionalInt(req.query.limit);
  const result = await listChatMessages(roomIdParam(req), req.dotsUser!.id, afterMs, limit);
  res.json(result);
}
