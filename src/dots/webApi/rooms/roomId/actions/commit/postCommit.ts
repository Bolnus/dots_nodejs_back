import type { Response as ExpressResponse } from "express";

import type { DotsServerAction } from "../../../../../game-synced/types.js";
import { commitAction } from "../../../../../roomService.js";
import { DotsApiError, sendDotsError } from "../../../../../errors.js";
import { roomIdParam } from "../../../../../dotsRequest.js";
import type { DotsRequest } from "../../../../../types.js";

/** Commits a game action when hashes match the server state. */
export async function postCommit(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const body = req.body as {
    action?: DotsServerAction;
    prevHash?: string;
    expectedNextHash?: string;
  };
  if (!req.dotsUser || !body.action || !body.prevHash || !body.expectedNextHash) {
    sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
    return;
  }
  const result = await commitAction(req.dotsUser.id, roomIdParam(req), {
    action: body.action,
    prevHash: body.prevHash,
    expectedNextHash: body.expectedNextHash
  });
  res.json(result);
}
