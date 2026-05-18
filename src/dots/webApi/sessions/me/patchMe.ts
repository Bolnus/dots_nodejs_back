import type { Response as ExpressResponse } from "express";

import { renameUser } from "../../../roomService.js";
import { DotsApiError, sendDotsError } from "../../../errors.js";
import type { DotsRequest } from "../../../types.js";

/** Updates the authenticated user's display name. */
export async function patchMe(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const { displayName } = req.body as { displayName?: string };
  if (!displayName?.trim() || !req.dotsUser) {
    sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
    return;
  }
  await renameUser(req.dotsUser.id, displayName);
  res.json({ userId: req.dotsUser.id, displayName: displayName.trim() });
}
