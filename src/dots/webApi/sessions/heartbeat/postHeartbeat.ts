import type { Response as ExpressResponse } from "express";

import { touchUser } from "../../../auth.js";
import { findActivePlayingRoom } from "../../../membership.js";
import type { DotsRequest, HeartbeatResult } from "../../../wireTypes.js";

/** Refreshes the authenticated user's last-seen timestamp and returns session info. */
export async function postHeartbeat(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    res.status(401).end();
    return;
  }
  await touchUser(req.dotsUser.id);
  const activeRoom = await findActivePlayingRoom(req.dotsUser.id);
  const body: HeartbeatResult = { activeRoom };
  res.json(body);
}
