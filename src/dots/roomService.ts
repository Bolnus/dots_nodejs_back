import { DotsRoomMemberRole, DotsRoomStatus, Prisma } from "@prisma/client";

import { DOTS_MAX_ACTIVE_ROOMS } from "../config.js";
import { prisma } from "../db/prisma.js";
import { currentServerPlacingPlayer, reduceServer } from "../game-synced/serverReducer.js";
import { initialServerStateFromConfig } from "../game-synced/serverState.js";
import type { DotsServerAction, DotsServerGameState } from "../game-synced/types.js";
import { DOTS_GRID_MAX, DOTS_GRID_MIN } from "../game-synced/consts.js";
import { isValidGridDimension } from "../game-synced/logic.js";
import type { PlayerId } from "../game-synced/types.js";
import { assertNotBlocked } from "./membership.js";
import { roomWithMembers, type RoomWithMembers } from "./membershipConsts.js";
import { MAX_PLAYERS } from "./consts.js";
import { mapRoomToDetail, mapRoomToSummary } from "./roomMapper.js";
import { DotsApiError } from "./errors.js";
import { hashPassword, verifyPassword } from "./auth.js";
import type { DotsLocalState } from "./localStateWire.js";
import type { CommitActionResult, DotsBoardConfig, DotsRoomDetail, DotsRoomSummary } from "./wireTypes.js";
import { broadcastRoomEvent } from "./events.js";

/** Loads a room with members or throws when missing. */
async function loadRoom(roomId: string): Promise<RoomWithMembers> {
  const room = await prisma.dotsRoom.findUnique({
    where: { id: roomId },
    ...roomWithMembers
  });
  if (!room) {
    throw new DotsApiError(404, "dotsRoomNotFound");
  }
  return room;
}

/** Validates board dimensions against game rules. */
function validateBoard(config: DotsBoardConfig): void {
  if (!isValidGridDimension(config.rows) || !isValidGridDimension(config.cols)) {
    throw new DotsApiError(400, "dotsInvalidGrid", {
      min: String(DOTS_GRID_MIN),
      max: String(DOTS_GRID_MAX)
    });
  }
}

/** Ensures the global active room cap has not been reached. */
async function assertActiveRoomCap(): Promise<void> {
  const count = await prisma.dotsRoom.count({
    where: { status: { in: [DotsRoomStatus.WAITING, DotsRoomStatus.PLAYING] } }
  });
  if (count >= DOTS_MAX_ACTIVE_ROOMS) {
    throw new DotsApiError(409, "dotsMaxRooms", { max: String(DOTS_MAX_ACTIVE_ROOMS) });
  }
}

/** Returns the player slot for a user in the room, if any. */
function findPlayerSlot(room: RoomWithMembers, userId: string): PlayerId | null {
  for (const member of room.members) {
    if (member.userId !== userId) {
      continue;
    }
    if (member.role === DotsRoomMemberRole.PLAYER0) {
      return "player0";
    }
    if (member.role === DotsRoomMemberRole.PLAYER1) {
      return "player1";
    }
  }
  return null;
}

/** True when the user is one of the locked players in an active game. */
function isLockedActingPlayer(room: RoomWithMembers, userId: string): boolean {
  if (room.status !== DotsRoomStatus.PLAYING) {
    return false;
  }
  return userId === room.lockedPlayer0UserId || userId === room.lockedPlayer1UserId;
}

/** True when it is this user's turn to commit or send presence. */
function isActingPlayer(room: RoomWithMembers, userId: string): boolean {
  const state = room.serverState as DotsServerGameState | null;
  if (!state || state.mode !== "play") {
    return false;
  }
  const slot = findPlayerSlot(room, userId);
  if (!slot) {
    return false;
  }
  if (
    room.status === DotsRoomStatus.PLAYING &&
    userId !== room.lockedPlayer0UserId &&
    userId !== room.lockedPlayer1UserId
  ) {
    return false;
  }
  return slot === currentServerPlacingPlayer(state);
}

/** Persists room changes and broadcasts a realtime event. */
async function saveAndBroadcast(
  roomId: string,
  data: Parameters<typeof prisma.dotsRoom.update>[0]["data"],
  eventType: "ROOM_STATE" | "STATE_DELTA" | "PRESENCE_DELTA"
): Promise<DotsRoomDetail> {
  const updated = await prisma.dotsRoom.update({
    where: { id: roomId },
    data,
    ...roomWithMembers
  });
  const detail = mapRoomToDetail(updated);
  broadcastRoomEvent(roomId, { type: eventType, room: detail });
  return detail;
}

/** Adds a user to a waiting or playing room with the correct role. */
async function addNewRoomMember(
  room: RoomWithMembers,
  roomId: string,
  userId: string,
  asViewer: boolean | undefined
): Promise<void> {
  if (room.status === DotsRoomStatus.PLAYING) {
    if (asViewer !== true) {
      throw new DotsApiError(409, "dotsPlayingLocked");
    }
    await prisma.dotsRoomMember.create({
      data: { roomId, userId, role: DotsRoomMemberRole.VIEWER }
    });
    return;
  }

  const wantsViewer = asViewer === true;
  const playerCount = room.members.filter(
    (m) => m.role === DotsRoomMemberRole.PLAYER0 || m.role === DotsRoomMemberRole.PLAYER1
  ).length;
  if (!wantsViewer && playerCount < MAX_PLAYERS) {
    const role =
      playerCount === 0 || !room.members.some((m) => m.role === DotsRoomMemberRole.PLAYER0)
        ? DotsRoomMemberRole.PLAYER0
        : DotsRoomMemberRole.PLAYER1;
    await prisma.dotsRoomMember.create({ data: { roomId, userId, role } });
    return;
  }

  await prisma.dotsRoomMember.create({
    data: { roomId, userId, role: DotsRoomMemberRole.VIEWER }
  });
}

/** Returns summaries for all rooms. */
export async function listRooms(): Promise<DotsRoomSummary[]> {
  const rooms = await prisma.dotsRoom.findMany({
    orderBy: { createdAt: "desc" },
    ...roomWithMembers
  });
  return rooms.map((room) => mapRoomToSummary(room));
}

/** Returns full detail for one room. */
export async function getRoom(roomId: string): Promise<DotsRoomDetail> {
  return mapRoomToDetail(await loadRoom(roomId));
}

/** Creates a new waiting room owned by the authenticated user. */
export async function createRoom(
  userId: string,
  body: Readonly<{ name: string; config: DotsBoardConfig; isPrivate: boolean; password?: string }>
): Promise<DotsRoomDetail> {
  await assertNotBlocked(userId);
  await assertActiveRoomCap();
  validateBoard(body.config);

  const passwordHash = body.isPrivate && body.password && body.password.length > 0 ? hashPassword(body.password) : null;

  const room = await prisma.dotsRoom.create({
    data: {
      name: body.name.trim() || "Room",
      ownerUserId: userId,
      status: DotsRoomStatus.WAITING,
      isPrivate: body.isPrivate,
      passwordHash,
      rows: body.config.rows,
      cols: body.config.cols,
      members: {
        create: {
          userId,
          role: DotsRoomMemberRole.PLAYER0
        }
      }
    },
    ...roomWithMembers
  });

  const detail = mapRoomToDetail(room);
  broadcastRoomEvent(room.id, { type: "ROOM_STATE", room: detail });
  return detail;
}

/** Patches room settings (owner, waiting only). */
export async function patchRoom(
  userId: string,
  roomId: string,
  body: Readonly<{ config?: DotsBoardConfig; isPrivate?: boolean; password?: string; kickUserId?: string }>
): Promise<DotsRoomDetail> {
  const room = await loadRoom(roomId);
  if (room.ownerUserId !== userId) {
    throw new DotsApiError(403, "dotsOwnerOnly");
  }
  if (room.status !== DotsRoomStatus.WAITING) {
    throw new DotsApiError(409, "dotsSettingsLocked");
  }

  const data: Parameters<typeof prisma.dotsRoom.update>[0]["data"] = {};
  if (body.config !== undefined) {
    validateBoard(body.config);
    data.rows = body.config.rows;
    data.cols = body.config.cols;
  }
  if (body.isPrivate !== undefined) {
    data.isPrivate = body.isPrivate;
  }
  if (body.password !== undefined) {
    data.passwordHash = body.password === "" ? null : hashPassword(body.password);
  }
  if (body.kickUserId !== undefined && body.kickUserId !== room.ownerUserId) {
    await prisma.dotsRoomMember.deleteMany({
      where: { roomId, userId: body.kickUserId }
    });
  }

  return saveAndBroadcast(roomId, data, "STATE_DELTA");
}

/** Joins a room as player or viewer. */
export async function joinRoom(
  userId: string,
  _displayName: string,
  roomId: string,
  body: Readonly<{ password?: string; asViewer?: boolean }>
): Promise<DotsRoomDetail> {
  const room = await loadRoom(roomId);
  if (!verifyPassword(body.password ?? "", room.passwordHash)) {
    throw new DotsApiError(403, "dotsWrongPassword");
  }

  const already = room.members.some((m) => m.userId === userId);
  if (!already) {
    await addNewRoomMember(room, roomId, userId, body.asViewer);
  }

  return saveAndBroadcast(roomId, {}, "STATE_DELTA");
}

/** Removes a user from a room; owners delete the room. */
export async function leaveRoom(userId: string, roomId: string): Promise<void> {
  const room = await loadRoom(roomId);
  if (room.ownerUserId === userId) {
    const snapshot = mapRoomToDetail({ ...room, status: DotsRoomStatus.FINISHED });
    await prisma.dotsRoom.delete({ where: { id: roomId } });
    broadcastRoomEvent(roomId, { type: "STATE_DELTA", room: snapshot });
    return;
  }
  await prisma.dotsRoomMember.deleteMany({ where: { roomId, userId } });
  await saveAndBroadcast(roomId, {}, "STATE_DELTA");
}

/** Starts a game when two players are present. */
export async function startGame(userId: string, roomId: string): Promise<DotsRoomDetail> {
  const room = await loadRoom(roomId);
  if (room.ownerUserId !== userId) {
    throw new DotsApiError(403, "dotsOwnerOnly");
  }
  const players = room.members.filter(
    (m) => m.role === DotsRoomMemberRole.PLAYER0 || m.role === DotsRoomMemberRole.PLAYER1
  );
  if (players.length < MAX_PLAYERS) {
    throw new DotsApiError(409, "dotsNeedTwoPlayers");
  }
  const p0 = players.find((m) => m.role === DotsRoomMemberRole.PLAYER0);
  const p1 = players.find((m) => m.role === DotsRoomMemberRole.PLAYER1);
  const serverState = initialServerStateFromConfig({ rows: room.rows, cols: room.cols });

  return saveAndBroadcast(
    roomId,
    {
      status: DotsRoomStatus.PLAYING,
      serverState,
      presence: Prisma.JsonNull,
      presenceByUserId: null,
      lockedPlayer0UserId: p0?.userId ?? room.ownerUserId,
      lockedPlayer1UserId: p1?.userId ?? null
    },
    "STATE_DELTA"
  );
}

/** Applies a checksum-validated committed game action. */
export async function commitAction(
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
  if (!isLockedActingPlayer(room, userId) || !isActingPlayer(room, userId)) {
    return { status: "rejected", reason: "notAuthorized", snapshot: mapRoomToDetail(room) };
  }

  const state = room.serverState as DotsServerGameState;
  if (body.prevHash !== state.hash) {
    return { status: "rejected", reason: "prevHash", snapshot: mapRoomToDetail(room) };
  }

  const nextState = reduceServer(state, body.action);
  if (nextState === state) {
    return { status: "rejected", reason: "notAuthorized", snapshot: mapRoomToDetail(room) };
  }
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
  return { status: "ok" };
}

/** Stores and broadcasts ephemeral in-flight UI state. */
export async function applyEphemeral(userId: string, roomId: string, patch: DotsLocalState): Promise<void> {
  const room = await loadRoom(roomId);
  if (!room.serverState || room.status !== DotsRoomStatus.PLAYING) {
    return;
  }
  if (!isActingPlayer(room, userId)) {
    return;
  }
  await saveAndBroadcast(
    roomId,
    {
      presence: patch,
      presenceByUserId: userId
    },
    "PRESENCE_DELTA"
  );
}

/** Renames the authenticated user when not blocked by active membership. */
export async function renameUser(userId: string, displayName: string): Promise<void> {
  await assertNotBlocked(userId);
  const trimmed = displayName.trim();
  const normalizedName = trimmed.toLowerCase();
  const conflict = await prisma.dotsUser.findFirst({
    where: { normalizedName, NOT: { id: userId } }
  });
  if (conflict) {
    throw new DotsApiError(409, "dotsNameTaken");
  }
  await prisma.dotsUser.update({
    where: { id: userId },
    data: { displayName: trimmed, normalizedName }
  });
}

/** Deletes the authenticated user when not blocked by active membership. */
export async function dropSession(userId: string): Promise<void> {
  await assertNotBlocked(userId);
  await prisma.dotsUser.delete({ where: { id: userId } });
}
