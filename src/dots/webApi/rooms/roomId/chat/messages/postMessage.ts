import type { Response as ExpressResponse } from "express";

import { postChatMessage } from "../../../../../chatService.js";
import { roomIdParam } from "../../../../../dotsRequest.js";
import { DotsApiError, sendDotsError } from "../../../../../errors.js";
import type { DotsRequest } from "../../../../../wireTypes.js";

/** Posts a chat message from a room member (not forwarded to the LLM). */
export async function postMessage(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const body = req.body as { content?: string };
  if (!req.dotsUser || typeof body.content !== "string") {
    sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
    return;
  }
  const message = await postChatMessage(roomIdParam(req), req.dotsUser.id, body.content);
  res.status(201).json(message);
}
