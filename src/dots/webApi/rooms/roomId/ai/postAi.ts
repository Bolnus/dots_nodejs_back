import type { Response as ExpressResponse } from "express";

import { addAiPlayer } from "../../../../aiPlayerService.js";
import { roomIdParam } from "../../../../dotsRequest.js";
import { DotsApiError, sendDotsError } from "../../../../errors.js";
import type { DotsRequest } from "../../../../wireTypes.js";

/** Adds an AI opponent to the second player slot in a waiting room. */
export async function postAi(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    sendDotsError(res, req.languageCode, new DotsApiError(401, "dotsUnauthorized"));
    return;
  }
  const result = await addAiPlayer(req.dotsUser.id, roomIdParam(req));
  res.json(result);
}
