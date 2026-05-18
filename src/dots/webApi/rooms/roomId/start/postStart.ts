import { DotsRoomMemberRole, DotsRoomStatus, Prisma } from "@prisma/client";
import type { Response as ExpressResponse } from "express";

import { initialServerStateFromConfig } from "../../../../game-synced/serverState.js";
import { DotsApiError } from "../../../../errors.js";
import { roomIdParam } from "../../../../dotsRequest.js";
import { MAX_PLAYERS } from "../../../../consts.js";
import { loadRoom, saveAndBroadcast } from "../../../../roomService.js";
import type { DotsRequest, DotsRoomDetail } from "../../../../wireTypes.js";

/** Starts a game when two players are present. */
async function startGame(userId: string, roomId: string): Promise<DotsRoomDetail> {
  const room = await loadRoom(roomId);
  if (room.ownerUserId !== userId) {
    throw new DotsApiError(403, "dotsOwnerOnly");
  }
  const players = room.members.filter(
    (member) => member.role === DotsRoomMemberRole.PLAYER0 || member.role === DotsRoomMemberRole.PLAYER1
  );
  if (players.length < MAX_PLAYERS) {
    throw new DotsApiError(409, "dotsNeedTwoPlayers");
  }
  const player0 = players.find((member) => member.role === DotsRoomMemberRole.PLAYER0);
  const player1 = players.find((member) => member.role === DotsRoomMemberRole.PLAYER1);
  const serverState = initialServerStateFromConfig({ rows: room.rows, cols: room.cols });

  return saveAndBroadcast(
    roomId,
    {
      status: DotsRoomStatus.PLAYING,
      serverState,
      presence: Prisma.JsonNull,
      presenceByUserId: null,
      lockedPlayer0UserId: player0?.userId ?? room.ownerUserId,
      lockedPlayer1UserId: player1?.userId ?? null
    },
    "STATE_DELTA"
  );
}

/** Starts a game in a waiting room with two players. */
export async function postStart(req: DotsRequest, res: ExpressResponse): Promise<void> {
  if (!req.dotsUser) {
    return;
  }
  const room = await startGame(req.dotsUser.id, roomIdParam(req));
  res.json(room);
}
