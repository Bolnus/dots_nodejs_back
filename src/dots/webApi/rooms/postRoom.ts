import type { Response as ExpressResponse } from "express";

import { createRoom } from "../../roomService.js";
import { DotsApiError, sendDotsError } from "../../errors.js";
import type { DotsRequest } from "../../types.js";

/** Creates a new dots room owned by the authenticated user. */
export async function postRoom(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const body = req.body as {
    name?: string;
    config?: { rows?: number; cols?: number };
    isPrivate?: boolean;
    password?: string;
  };
  if (!req.dotsUser || !body.config) {
    sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
    return;
  }
  const room = await createRoom(req.dotsUser.id, {
    name: body.name ?? "",
    config: { rows: body.config.rows ?? 0, cols: body.config.cols ?? 0 },
    isPrivate: Boolean(body.isPrivate),
    password: body.password
  });
  res.status(201).json(room);
}
