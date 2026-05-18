import type { Request as ExpressRequest } from "express";

/** Reads `roomId` from route params. */
export function roomIdParam(req: ExpressRequest): string {
  const raw = req.params.roomId;
  return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
}
