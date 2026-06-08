import type { Response as ExpressResponse } from "express";

import { listChatMessages } from "../../../../../chatService.js";
import { roomIdParam } from "../../../../../dotsRequest.js";
import { DotsApiError, sendDotsError } from "../../../../../errors.js";
import type { DotsRequest } from "../../../../../wireTypes.js";

/** Parses an optional positive integer query parameter. */
function parseOptionalInt(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Returns paginated chat messages for a room member. */
export async function getMessages(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    sendDotsError(res, req.languageCode, new DotsApiError(401, "dotsUnauthorized"));
    return;
  }
  const afterMs = parseOptionalInt(req.query.afterMs);
  const limit = parseOptionalInt(req.query.limit);
  const result = await listChatMessages(roomIdParam(req), req.dotsUser.id, afterMs, limit);
  res.json(result);
}
