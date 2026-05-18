import { Router, type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";

import { authenticateBearer } from "../auth.js";
import { DotsApiError, sendDotsError } from "../errors.js";
import type { DotsRequest } from "../wireTypes.js";
import { getRooms } from "./rooms/getRooms.js";
import { postRoom } from "./rooms/postRoom.js";
import { postCommit } from "./rooms/roomId/actions/commit/postCommit.js";
import { getRoomById } from "./rooms/roomId/getRoom.js";
import { postJoin } from "./rooms/roomId/join/postJoin.js";
import { postLeave } from "./rooms/roomId/leave/postLeave.js";
import { patchRoomById } from "./rooms/roomId/patchRoom.js";
import { postStart } from "./rooms/roomId/start/postStart.js";
import { deleteMe } from "./sessions/me/deleteMe.js";
import { patchMe } from "./sessions/me/patchMe.js";
import { postRegister } from "./sessions/register/postRegister.js";
import { postHeartbeat } from "./sessions/heartbeat/postHeartbeat.js";

/** Parses the preferred locale from the Accept-Language header. */
function languageFromRequest(req: ExpressRequest): string | undefined {
  const header = req.headers["accept-language"];
  if (typeof header === "string") {
    return header.split(",")[0]?.trim();
  }
  return undefined;
}

/** Requires a valid bearer token and attaches the user to the request. */
async function requireAuth(req: DotsRequest, res: ExpressResponse, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const user = await authenticateBearer(token);
    if (!user) {
      sendDotsError(res, req.languageCode, new DotsApiError(401, "dotsUnauthorized"));
      return;
    }
    req.dotsUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Runs an async dots route handler with localized error responses. */
async function runDotsRoute(
  req: DotsRequest,
  res: ExpressResponse,
  handler: (req: DotsRequest, res: ExpressResponse) => Promise<void>
): Promise<void> {
  req.languageCode = languageFromRequest(req);
  try {
    await handler(req, res);
  } catch (err: unknown) {
    if (err instanceof DotsApiError) {
      sendDotsError(res, req.languageCode, err);
      return;
    }
    console.error(err);
    sendDotsError(res, req.languageCode, new DotsApiError(500, "dotsInternal"));
  }
}

/** Wraps an async route handler with localized error responses. */
function handleDotsRoute(handler: (req: DotsRequest, res: ExpressResponse) => Promise<void>) {
  return (req: DotsRequest, res: ExpressResponse): void => void runDotsRoute(req, res, handler);
}

/** Creates the `/dots` REST router. */
export function createDotsRouter(): Router {
  const router = Router();

  router.post(
    "/sessions/register",
    handleDotsRoute((req, res) => postRegister(req, res))
  );
  router.patch(
    "/sessions/me",
    requireAuth,
    handleDotsRoute((req, res) => patchMe(req, res))
  );
  router.delete(
    "/sessions/me",
    requireAuth,
    handleDotsRoute((req, res) => deleteMe(req, res))
  );
  router.post(
    "/sessions/heartbeat",
    requireAuth,
    handleDotsRoute((req, res) => postHeartbeat(req, res))
  );

  router.get(
    "/rooms",
    handleDotsRoute((req, res) => getRooms(req, res))
  );
  router.post(
    "/rooms",
    requireAuth,
    handleDotsRoute((req, res) => postRoom(req, res))
  );
  router.get(
    "/rooms/:roomId",
    handleDotsRoute((req, res) => getRoomById(req, res))
  );
  router.patch(
    "/rooms/:roomId",
    requireAuth,
    handleDotsRoute((req, res) => patchRoomById(req, res))
  );
  router.post(
    "/rooms/:roomId/join",
    requireAuth,
    handleDotsRoute((req, res) => postJoin(req, res))
  );
  router.post(
    "/rooms/:roomId/leave",
    requireAuth,
    handleDotsRoute((req, res) => postLeave(req, res))
  );
  router.post(
    "/rooms/:roomId/start",
    requireAuth,
    handleDotsRoute((req, res) => postStart(req, res))
  );
  router.post(
    "/rooms/:roomId/actions/commit",
    requireAuth,
    handleDotsRoute((req, res) => postCommit(req, res))
  );

  return router;
}
