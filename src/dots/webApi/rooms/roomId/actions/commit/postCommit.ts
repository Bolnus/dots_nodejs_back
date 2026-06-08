import type { Response as ExpressResponse } from "express";

import { scheduleAiTurnIfNeeded } from "../../../../../ai/aiTurnService.js";
import { commitAction } from "../../../../../commitService.js";
import type { DotsServerAction } from "../../../../../game-synced/types.js";
import { DotsApiError, sendDotsError } from "../../../../../errors.js";
import { roomIdParam } from "../../../../../dotsRequest.js";
import type { DotsRequest } from "../../../../../wireTypes.js";

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
  const result = await commitAction(roomIdParam(req), req.languageCode, body.action, {
    kind: "human",
    userId: req.dotsUser.id,
    prevHash: body.prevHash,
    expectedNextHash: body.expectedNextHash
  });
  if (result.status === "ok") {
    scheduleAiTurnIfNeeded(roomIdParam(req));
  }
  res.json(result);
}
