import type { Response as ExpressResponse } from "express";

import { prisma } from "../../../../db/prisma.js";
import { assertNotBlocked } from "../../../membership.js";
import type { DotsRequest } from "../../../wireTypes.js";

/** Deletes the authenticated user when not blocked by active membership. */
async function dropSession(userId: string): Promise<void> {
  await assertNotBlocked(userId);
  await prisma.dotsUser.delete({ where: { id: userId } });
}

/** Drops the authenticated user's session. */
export async function deleteMe(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    return;
  }
  await dropSession(req.dotsUser.id);
  res.status(204).end();
}
