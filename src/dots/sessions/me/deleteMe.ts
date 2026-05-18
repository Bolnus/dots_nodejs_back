import type { Response as ExpressResponse } from "express";

import { dropSession } from "../../roomService.js";
import type { DotsRequest } from "../../types.js";

/** Drops the authenticated user's session. */
export async function deleteMe(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    return;
  }
  await dropSession(req.dotsUser.id);
  res.status(204).end();
}
