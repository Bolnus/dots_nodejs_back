import type { Response as ExpressResponse } from "express";

import { prisma } from "../../../../db/prisma.js";
import { assertNotBlocked } from "../../../membership.js";
import { DotsApiError, sendDotsError } from "../../../errors.js";
import type { DotsRequest } from "../../../wireTypes.js";

/** Renames the authenticated user when not blocked by active membership. */
async function renameUser(userId: string, displayName: string): Promise<void> {
  await assertNotBlocked(userId);
  const trimmed = displayName.trim();
  const normalizedName = trimmed.toLowerCase();
  const conflict = await prisma.dotsUser.findFirst({
    where: { normalizedName, NOT: { id: userId } }
  });
  if (conflict) {
    throw new DotsApiError(409, "dotsNameTaken");
  }
  await prisma.dotsUser.update({
    where: { id: userId },
    data: { displayName: trimmed, normalizedName }
  });
}

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
