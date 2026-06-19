import { DotsRoomStatus } from "@prisma/client";

import { notifyAdmin } from "../adminNotify/notifyAdmin.js";
import { DOTS_MAX_ACTIVE_ROOMS, DOTS_MAX_CHAT_MESSAGES_PER_ROOM, DOTS_MAX_USERS } from "../config.js";
import { prisma } from "../db/prisma.js";
import { DotsApiError } from "./errors.js";

/** Notifies the admin that a table quota was exceeded. */
function notifyQuotaExceeded(table: string, limit: number): void {
  notifyAdmin({
    category: "quota_exceeded",
    title: "Dots: quota exceeded",
    body: `${table} limit (${limit}) reached.`,
    dedupeKey: `quota:${table}`
  });
}

/** Ensures the global user count is below the configured cap. */
export async function assertUserCap(): Promise<void> {
  const count = await prisma.dotsUser.count();
  if (count >= DOTS_MAX_USERS) {
    notifyQuotaExceeded("DotsUser", DOTS_MAX_USERS);
    throw new DotsApiError(409, "dotsMaxUsers", { max: String(DOTS_MAX_USERS) });
  }
}

/** Ensures a chat has not reached the per-room message cap. */
export async function assertChatMessageCap(chatId: string): Promise<void> {
  const count = await prisma.dotsChatMessage.count({ where: { chatId } });
  if (count >= DOTS_MAX_CHAT_MESSAGES_PER_ROOM) {
    notifyQuotaExceeded("DotsChatMessage", DOTS_MAX_CHAT_MESSAGES_PER_ROOM);
    throw new DotsApiError(409, "dotsChatMessageCap", { max: String(DOTS_MAX_CHAT_MESSAGES_PER_ROOM) });
  }
}

/** Ensures the global active room cap has not been reached. */
export async function assertActiveRoomCap(): Promise<void> {
  const count = await prisma.dotsRoom.count({
    where: { status: { in: [DotsRoomStatus.WAITING, DotsRoomStatus.PLAYING] } }
  });
  if (count >= DOTS_MAX_ACTIVE_ROOMS) {
    notifyQuotaExceeded("DotsRoom", DOTS_MAX_ACTIVE_ROOMS);
    throw new DotsApiError(409, "dotsMaxRooms", { max: String(DOTS_MAX_ACTIVE_ROOMS) });
  }
}
