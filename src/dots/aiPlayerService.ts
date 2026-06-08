import { createHash, randomBytes } from "node:crypto";

import { DotsRoomMemberRole, DotsRoomStatus, type Prisma } from "@prisma/client";

import { LLM_MODEL } from "../config.js";
import { prisma } from "../db/prisma.js";
import { DotsApiError } from "./errors.js";
import { AI_USER_NORMALIZED_PREFIX } from "./aiPlayerConsts.js";
import { loadRoom, saveAndBroadcast } from "./roomService.js";
import type { AddAiResult } from "./wireTypes.js";

/** Builds the unique normalized name for a room's synthetic AI user. */
function aiNormalizedName(roomId: string): string {
  return `${AI_USER_NORMALIZED_PREFIX}${roomId}`;
}

/** Returns true when the player1 slot is free for an AI opponent. */
function isPlayer1SlotFree(room: Awaited<ReturnType<typeof loadRoom>>): boolean {
  if (room.aiPlayerUserId !== null) {
    return false;
  }
  return !room.members.some((member) => member.role === DotsRoomMemberRole.PLAYER1);
}

/** Removes a synthetic AI user and clears the room's AI reference. */
export async function removeAiPlayer(roomId: string, aiUserId: string): Promise<void> {
  await prisma.dotsRoomMember.deleteMany({ where: { roomId, userId: aiUserId } });
  await prisma.dotsRoom.update({
    where: { id: roomId },
    data: { aiPlayerUserId: null }
  });
  await prisma.dotsUser.deleteMany({ where: { id: aiUserId } });
}

type CreateAiPlayerArgs = Readonly<{
  roomId: string;
  modelName: string;
  sessionTokenHash: string;
}>;

/** Creates a synthetic AI user, membership, and room reference within a transaction. */
async function createAiPlayerInRoom(tx: Prisma.TransactionClient, args: CreateAiPlayerArgs): Promise<void> {
  const aiUser = await tx.dotsUser.create({
    data: {
      displayName: args.modelName,
      normalizedName: aiNormalizedName(args.roomId),
      sessionTokenHash: args.sessionTokenHash
    }
  });
  await tx.dotsRoomMember.create({
    data: { roomId: args.roomId, userId: aiUser.id, role: DotsRoomMemberRole.PLAYER1 }
  });
  await tx.dotsRoom.update({
    where: { id: args.roomId },
    data: { aiPlayerUserId: aiUser.id }
  });
}

/** Adds an LLM opponent to player1 in a waiting room owned by `userId`. */
export async function addAiPlayer(userId: string, roomId: string): Promise<AddAiResult> {
  const room = await loadRoom(roomId);
  if (room.ownerUserId !== userId) {
    throw new DotsApiError(403, "dotsOwnerOnly");
  }
  if (room.status !== DotsRoomStatus.WAITING) {
    throw new DotsApiError(409, "dotsSettingsLocked");
  }
  if (!isPlayer1SlotFree(room)) {
    throw new DotsApiError(409, "dotsAiSlotTaken");
  }
  if (!LLM_MODEL.trim()) {
    throw new DotsApiError(503, "dotsLlmUnavailable");
  }

  const modelName = LLM_MODEL.trim();
  const sessionTokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");

  await prisma.$transaction((tx) => createAiPlayerInRoom(tx, { roomId, modelName, sessionTokenHash }));

  const detail = await saveAndBroadcast(roomId, {}, "STATE_DELTA");
  return { modelName, room: detail };
}

/** Kicks the AI player when `kickUserId` matches the room's AI user. */
export async function kickAiPlayerIfNeeded(
  roomId: string,
  kickUserId: string,
  aiPlayerUserId: string | null
): Promise<void> {
  if (aiPlayerUserId === null || kickUserId !== aiPlayerUserId) {
    return;
  }
  await removeAiPlayer(roomId, aiPlayerUserId);
}

/** Returns the AI player's slot (`player1`) when the room has an AI opponent. */
export function aiPlayerSlot(room: Readonly<{ aiPlayerUserId: string | null }>): "player1" | null {
  return room.aiPlayerUserId !== null ? "player1" : null;
}
