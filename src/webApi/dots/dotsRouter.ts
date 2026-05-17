import { Router, type NextFunction, type Request as ExpressRequest, type Response as ExpressResponse } from "express";

import { authenticateBearer, registerUser, type AuthUser } from "../../dots/auth.js";
import { DotsApiError, sendDotsError } from "../../dots/errors.js";
import {
  commitAction,
  createRoom,
  dropSession,
  getRoom,
  joinRoom,
  leaveRoom,
  listRooms,
  patchRoom,
  renameUser,
  startGame
} from "../../dots/roomService.js";
import type { DotsServerAction } from "../../game-synced/serverReducer.js";
import { touchUser } from "../../dots/auth.js";

export type DotsRequest = ExpressRequest & {
  dotsUser?: AuthUser;
  languageCode?: string;
};

/** Reads `roomId` from route params. */
function roomIdParam(req: ExpressRequest): string {
  const raw = req.params.roomId;
  return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
}

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

/** Wraps an async route handler with localized error responses. */
function handleDotsRoute(handler: (req: DotsRequest, res: ExpressResponse) => Promise<void>) {
  return (req: DotsRequest, res: ExpressResponse): void => {
    req.languageCode = languageFromRequest(req);
    void handler(req, res).catch((err: unknown) => {
      if (err instanceof DotsApiError) {
        sendDotsError(res, req.languageCode, err);
        return;
      }
      if (err instanceof Error && err.message === "blocked") {
        sendDotsError(res, req.languageCode, new DotsApiError(409, "dotsActiveRoomBlocked"));
        return;
      }
      console.error(err);
      sendDotsError(res, req.languageCode, new DotsApiError(500, "dotsInternal"));
    });
  };
}

/** Creates the `/dots` REST router. */
export function createDotsRouter(): Router {
  const router = Router();

  router.post(
    "/sessions/register",
    handleDotsRoute(async (req, res) => {
      const { displayName } = req.body as { displayName?: string };
      if (!displayName?.trim()) {
        sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
        return;
      }
      try {
        const { user, token } = await registerUser(displayName);
        res.json({ userId: user.id, displayName: user.displayName, token });
      } catch (err) {
        if (err instanceof Error && err.message === "blocked") {
          sendDotsError(res, req.languageCode, new DotsApiError(409, "dotsActiveRoomBlocked"));
          return;
        }
        throw err;
      }
    })
  );

  router.patch(
    "/sessions/me",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      const { displayName } = req.body as { displayName?: string };
      if (!displayName?.trim() || !req.dotsUser) {
        sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
        return;
      }
      await renameUser(req.dotsUser.id, displayName);
      res.json({ userId: req.dotsUser.id, displayName: displayName.trim() });
    })
  );

  router.delete(
    "/sessions/me",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      if (!req.dotsUser) {
        return;
      }
      await dropSession(req.dotsUser.id);
      res.status(204).end();
    })
  );

  router.post(
    "/sessions/heartbeat",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      if (req.dotsUser) {
        await touchUser(req.dotsUser.id);
      }
      res.status(204).end();
    })
  );

  router.get(
    "/rooms",
    handleDotsRoute(async (_req, res) => {
      const rooms = await listRooms();
      res.json(rooms);
    })
  );

  router.post(
    "/rooms",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      const body = req.body as {
        name?: string;
        config?: { rows?: number; cols?: number };
        isPrivate?: boolean;
        password?: string;
      };
      if (!req.dotsUser || !body.config) {
        sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
        return;
      }
      const room = await createRoom(req.dotsUser.id, {
        name: body.name ?? "",
        config: { rows: body.config.rows ?? 0, cols: body.config.cols ?? 0 },
        isPrivate: Boolean(body.isPrivate),
        password: body.password
      });
      res.status(201).json(room);
    })
  );

  router.get(
    "/rooms/:roomId",
    handleDotsRoute(async (req, res) => {
      const room = await getRoom(roomIdParam(req));
      res.json(room);
    })
  );

  router.patch(
    "/rooms/:roomId",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      const body = req.body as {
        config?: { rows?: number; cols?: number };
        isPrivate?: boolean;
        password?: string;
        kickUserId?: string;
      };
      if (!req.dotsUser) {
        return;
      }
      const room = await patchRoom(req.dotsUser.id, roomIdParam(req), {
        config: body.config ? { rows: body.config.rows ?? 0, cols: body.config.cols ?? 0 } : undefined,
        isPrivate: body.isPrivate,
        password: body.password,
        kickUserId: body.kickUserId
      });
      res.json(room);
    })
  );

  router.post(
    "/rooms/:roomId/join",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      const body = req.body as { password?: string; asViewer?: boolean };
      if (!req.dotsUser) {
        return;
      }
      const room = await joinRoom(req.dotsUser.id, req.dotsUser.displayName, roomIdParam(req), body);
      res.json(room);
    })
  );

  router.post(
    "/rooms/:roomId/leave",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      if (!req.dotsUser) {
        return;
      }
      await leaveRoom(req.dotsUser.id, roomIdParam(req));
      res.status(204).end();
    })
  );

  router.post(
    "/rooms/:roomId/start",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      if (!req.dotsUser) {
        return;
      }
      const room = await startGame(req.dotsUser.id, roomIdParam(req));
      res.json(room);
    })
  );

  router.post(
    "/rooms/:roomId/actions/commit",
    requireAuth,
    handleDotsRoute(async (req, res) => {
      const body = req.body as {
        action?: DotsServerAction;
        prevHash?: string;
        expectedNextHash?: string;
      };
      if (!req.dotsUser || !body.action || !body.prevHash || !body.expectedNextHash) {
        sendDotsError(res, req.languageCode, new DotsApiError(400, "dotsInternal"));
        return;
      }
      const result = await commitAction(req.dotsUser.id, roomIdParam(req), {
        action: body.action,
        prevHash: body.prevHash,
        expectedNextHash: body.expectedNextHash
      });
      res.json(result);
    })
  );

  return router;
}
