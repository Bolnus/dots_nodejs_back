import type { Response as ExpressResponse } from "express";

import { touchUser } from "../../../auth.js";
import type { DotsRequest } from "../../../types.js";

/** Refreshes the authenticated user's last-seen timestamp. */
export async function postHeartbeat(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (req.dotsUser) {
    await touchUser(req.dotsUser.id);
  }
  res.status(204).end();
}
