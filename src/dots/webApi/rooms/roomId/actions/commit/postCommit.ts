import { DotsRoomStatus, Prisma } from "@prisma/client";
import type { Response as ExpressResponse } from "express";

import { formatCommitRejectMessage } from "../../../../../../locales/commitRejectMessage.js";
import { reduceServer } from "../../../../../game-synced/serverReducer.js";
import type { DotsServerAction, DotsServerGameState } from "../../../../../game-synced/types.js";
import { mapRoomToDetail } from "../../../../../roomMapper.js";
import { DotsApiError, sendDotsError } from "../../../../../errors.js";
import { roomIdParam } from "../../../../../dotsRequest.js";
import { releaseLockedPlayerMemberships } from "../../../../../membership.js";
import { canCommitAction, loadRoom, saveAndBroadcast } from "../../../../../roomService.js";
import type { CommitActionResult, CommitRejectReason, DotsRequest, DotsRoomDetail } from "../../../../../wireTypes.js";

/** Builds a rejected commit response with a localized `messageLocal` for the client. */
function rejectedCommit(
  languageCode: string | undefined,
  reason: CommitRejectReason,
  snapshot: DotsRoomDetail
): CommitActionResult {
  return {
    status: "rejected",
    reason,
    messageLocal: formatCommitRejectMessage(languageCode, reason),
    snapshot
  };
}

/** Applies a checksum-validated committed game action. */
async function commitAction(
  userId: string,
  roomId: string,
  languageCode: string | undefined,
  body: Readonly<{
    action: DotsServerAction;
    prevHash: string;
    expectedNextHash: string;
  }>
): Promise<CommitActionResult> {
  const room = await loadRoom(roomId);

  if (room.status !== DotsRoomStatus.PLAYING || !room.serverState) {
    return rejectedCommit(languageCode, "notInGame", mapRoomToDetail(room));
  }
  if (!canCommitAction(room, userId, body.action)) {
    return rejectedCommit(languageCode, "notAuthorized", mapRoomToDetail(room));
  }

  const state = room.serverState as DotsServerGameState;
  if (body.prevHash !== state.hash) {
    return rejectedCommit(languageCode, "prevHash", mapRoomToDetail(room));
  }

  const reduced = reduceServer(state, body.action);
  if (!reduced.ok) {
    return rejectedCommit(languageCode, reduced.reason, mapRoomToDetail(room));
  }
  const nextState = reduced.state;
  if (nextState.hash !== body.expectedNextHash) {
    return rejectedCommit(languageCode, "badHash", mapRoomToDetail(room));
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
  const result = await commitAction(req.dotsUser.id, roomIdParam(req), req.languageCode, {
    action: body.action,
    prevHash: body.prevHash,
    expectedNextHash: body.expectedNextHash
  });
  res.json(result);
}
