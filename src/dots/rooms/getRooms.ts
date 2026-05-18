import type { Response as ExpressResponse } from "express";

import { listRooms } from "../roomService.js";
import type { DotsRequest } from "../types.js";

/** Lists all dots rooms. */
export async function getRooms(_req: DotsRequest, res: ExpressResponse): Promise<void> {
  const rooms = await listRooms();
  res.json(rooms);
}
