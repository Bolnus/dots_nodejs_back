import { DotsRoomStatus, Prisma } from "@prisma/client";
import type { Response as ExpressResponse } from "express";

import { reduceServer } from "../../../../../game-synced/serverReducer.js";
import type { DotsServerAction, DotsServerGameState } from "../../../../../game-synced/types.js";
import { mapRoomToDetail } from "../../../../../roomMapper.js";
import { DotsApiError, sendDotsError } from "../../../../../errors.js";
import { roomIdParam } from "../../../../../dotsRequest.js";
import { releaseLockedPlayerMemberships } from "../../../../../membership.js";
import { canCommitAction, loadRoom, saveAndBroadcast } from "../../../../../roomService.js";
import type { CommitActionResult, DotsRequest } from "../../../../../wireTypes.js";

/** Applies a checksum-validated committed game action. */
async function commitAction(
  userId: string,
  roomId: string,
  body: Readonly<{
    action: DotsServerAction;
    prevHash: string;
    expectedNextHash: string;
  }>
): Promise<CommitActionResult> {
  const room = await loadRoom(roomId);

  if (room.status !== DotsRoomStatus.PLAYING || !room.serverState) {
    return { status: "rejected", reason: "notInGame", snapshot: mapRoomToDetail(room) };
  }
  if (!canCommitAction(room, userId, body.action)) {
    return { status: "rejected", reason: "notAuthorized", snapshot: mapRoomToDetail(room) };
  }

  const state = room.serverState as DotsServerGameState;
  if (body.prevHash !== state.hash) {
    return { status: "rejected", reason: "prevHash", snapshot: mapRoomToDetail(room) };
  }

  const reduced = reduceServer(state, body.action);
  if (!reduced.ok) {
    return { status: "rejected", reason: reduced.reason, snapshot: mapRoomToDetail(room) };
  }
  const nextState = reduced.state;
  if (nextState.hash !== body.expectedNextHash) {
    return { status: "rejected", reason: "badHash", snapshot: mapRoomToDetail(room) };
  }

  const roomStatus = nextState.mode === "ended" ? DotsRoomStatus.FINISHED : DotsRoomStatus.PLAYING;
  await saveAndBroadcast(
    roomId,
    {
      serverState: nextState,
      status: roomStatus,
      presence: Prisma.JsonNull,
      presenceByUserId: null
    },
    "STATE_DELTA"
  );
  if (roomStatus === DotsRoomStatus.FINISHED) {
    await releaseLockedPlayerMemberships(room, roomId);
    await saveAndBroadcast(roomId, {}, "STATE_DELTA");
  }
  return { status: "ok" };
}

/** Commits a game action when hashes match the server state. */
export async function postCommit(req: DotsRequest, res: ExpressResponse): Promise<void> {
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
}
