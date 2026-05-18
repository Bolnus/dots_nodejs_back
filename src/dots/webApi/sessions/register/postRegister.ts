import type { Response as ExpressResponse } from "express";

import { registerUser } from "../../../auth.js";
import { DotsApiError, sendDotsError } from "../../../errors.js";
import type { DotsRequest } from "../../../wireTypes.js";

/** Registers a new session or re-authenticates by display name. */
export async function postRegister(req: DotsRequest, res: ExpressResponse): Promise<void> {
  const { displayName } = req.body as { displayName?: string };
  if (!displayName?.trim()) {
    sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
    return;
  }
  const { user, token } = await registerUser(displayName);
  res.json({ userId: user.id, displayName: user.displayName, token });
}
