import { DotsRoomStatus, Prisma } from "@prisma/client";

import { formatCommitRejectMessage } from "../locales/commitRejectMessage.js";
import { reduceServer } from "./game-synced/serverReducer.js";
import type { DotsServerAction, DotsServerGameState } from "./game-synced/types.js";
import { mapRoomToDetail } from "./roomMapper.js";
import { releaseLockedPlayerMemberships } from "./membership.js";
import { aiPlayerSlot } from "./aiPlayerService.js";
import { canCommitAction, isActingPlayer, loadRoom, saveAndBroadcast } from "./roomService.js";
import type { CommitActionResult, CommitRejectReason, DotsRoomDetail } from "./wireTypes.js";

export type CommitCaller =
  | Readonly<{ kind: "human"; userId: string; prevHash: string; expectedNextHash: string }>
  | Readonly<{ kind: "ai" }>;

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

/** Returns true when the AI player may commit the given action. */
function canAiCommitAction(room: Awaited<ReturnType<typeof loadRoom>>, action: DotsServerAction): boolean {
  if (room.aiPlayerUserId === null) {
    return false;
  }
  const slot = aiPlayerSlot(room);
  if (slot === null || action.by !== slot) {
    return false;
  }
  if (action.type === "SURRENDER") {
    return true;
  }
  return isActingPlayer(room, room.aiPlayerUserId);
}

/** Persists a reduced game state and broadcasts the delta. */
async function persistReducedState(
  room: Awaited<ReturnType<typeof loadRoom>>,
  roomId: string,
  nextState: DotsServerGameState
): Promise<void> {
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
}

/** Applies a committed game action for a human player or the AI opponent. */
export async function commitAction(
  roomId: string,
  languageCode: string | undefined,
  action: DotsServerAction,
  caller: CommitCaller
): Promise<CommitActionResult> {
  const room = await loadRoom(roomId);

  if (room.status !== DotsRoomStatus.PLAYING || !room.serverState) {
    return rejectedCommit(languageCode, "notInGame", mapRoomToDetail(room));
  }

  if (caller.kind === "human") {
    if (!canCommitAction(room, caller.userId, action)) {
      return rejectedCommit(languageCode, "notAuthorized", mapRoomToDetail(room));
    }
  } else if (!canAiCommitAction(room, action)) {
    return rejectedCommit(languageCode, "notAuthorized", mapRoomToDetail(room));
  }

  const state = room.serverState as DotsServerGameState;

  if (caller.kind === "human" && caller.prevHash !== state.hash) {
    return rejectedCommit(languageCode, "prevHash", mapRoomToDetail(room));
  }

  const reduced = reduceServer(state, action);
  if (!reduced.ok) {
    return rejectedCommit(languageCode, reduced.reason, mapRoomToDetail(room));
  }

  const nextState = reduced.state;
  if (caller.kind === "human" && nextState.hash !== caller.expectedNextHash) {
    return rejectedCommit(languageCode, "badHash", mapRoomToDetail(room));
  }

  await persistReducedState(room, roomId, nextState);
  return { status: "ok" };
}
