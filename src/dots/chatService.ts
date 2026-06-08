import { DotsChatSenderKind, DotsRoomMemberRole } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { broadcastRoomEvent } from "./events.js";
import { DotsApiError } from "./errors.js";
import { loadRoom } from "./roomService.js";
import type { DotsChatMessage, DotsChatSenderKind as WireChatSenderKind, ListChatMessagesResult } from "./wireTypes.js";

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;

/** Maps a Prisma chat sender kind to the wire enum. */
function toWireSenderKind(kind: DotsChatSenderKind): WireChatSenderKind {
  switch (kind) {
    case DotsChatSenderKind.AI:
      return "ai";
    case DotsChatSenderKind.PLAYER:
      return "player";
    case DotsChatSenderKind.VIEWER:
      return "viewer";
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/** Maps a room member role to a chat sender kind. */
function memberRoleToSenderKind(role: DotsRoomMemberRole): DotsChatSenderKind {
  if (role === DotsRoomMemberRole.VIEWER) {
    return DotsChatSenderKind.VIEWER;
  }
  return DotsChatSenderKind.PLAYER;
}

/** Ensures the user is a member of the room or throws. */
async function assertRoomMember(roomId: string, userId: string): Promise<void> {
  const room = await loadRoom(roomId);
  const isMember = room.members.some((member) => member.userId === userId);
  if (!isMember) {
    throw new DotsApiError(403, "dotsNotInRoom");
  }
}

/** Loads the chat row for a room or throws when missing. */
async function loadChatForRoom(roomId: string): Promise<{ id: string }> {
  const chat = await prisma.dotsChat.findUnique({ where: { roomId }, select: { id: true } });
  if (!chat) {
    throw new DotsApiError(404, "dotsRoomNotFound");
  }
  return chat;
}

/** Maps a persisted chat message row to the wire shape. */
function mapChatMessage(
  row: Readonly<{
    id: string;
    senderKind: DotsChatSenderKind;
    senderUserId: string | null;
    content: string;
    createdAt: Date;
    senderUser: { displayName: string } | null;
  }>
): DotsChatMessage {
  return {
    id: row.id,
    senderKind: toWireSenderKind(row.senderKind),
    senderUserId: row.senderUserId,
    senderDisplayName: row.senderUser?.displayName ?? null,
    content: row.content,
    createdAtMs: row.createdAt.getTime()
  };
}

/** Broadcasts a new chat message to subscribed WebSocket clients. */
function broadcastChatMessage(roomId: string, message: DotsChatMessage): void {
  broadcastRoomEvent(roomId, { type: "CHAT_MESSAGE", roomId, message });
}

/** Persists a chat message and broadcasts it to the room. */
async function persistChatMessage(
  roomId: string,
  senderKind: DotsChatSenderKind,
  senderUserId: string | null,
  content: string
): Promise<DotsChatMessage> {
  const chat = await loadChatForRoom(roomId);
  const row = await prisma.dotsChatMessage.create({
    data: { chatId: chat.id, senderKind, senderUserId, content },
    include: { senderUser: { select: { displayName: true } } }
  });
  const message = mapChatMessage(row);
  broadcastChatMessage(roomId, message);
  return message;
}

/** Returns paginated chat messages for a room member. */
export async function listChatMessages(
  roomId: string,
  userId: string,
  afterMs: number | undefined,
  limit: number | undefined
): Promise<ListChatMessagesResult> {
  await assertRoomMember(roomId, userId);
  const chat = await loadChatForRoom(roomId);
  const take = Math.min(Math.max(limit ?? DEFAULT_MESSAGE_LIMIT, 1), MAX_MESSAGE_LIMIT);
  const afterDate = afterMs !== undefined && Number.isFinite(afterMs) ? new Date(afterMs) : undefined;

  const rows = await prisma.dotsChatMessage.findMany({
    where: {
      chatId: chat.id,
      ...(afterDate !== undefined ? { createdAt: { gt: afterDate } } : {})
    },
    orderBy: { createdAt: "asc" },
    take,
    include: { senderUser: { select: { displayName: true } } }
  });

  return { messages: rows.map(mapChatMessage) };
}

/** Stores a human chat message from a room member (not forwarded to the LLM). */
export async function postChatMessage(roomId: string, userId: string, content: string): Promise<DotsChatMessage> {
  const trimmed = content.trim();
  if (trimmed === "") {
    throw new DotsApiError(400, "dotsChatMessageEmpty");
  }
  const room = await loadRoom(roomId);
  const member = room.members.find((entry) => entry.userId === userId);
  if (!member) {
    throw new DotsApiError(403, "dotsNotInRoom");
  }
  return persistChatMessage(roomId, memberRoleToSenderKind(member.role), userId, trimmed);
}

/** Stores an AI chat message visible to room members. */
export async function postAiChatMessage(roomId: string, content: string): Promise<DotsChatMessage> {
  const trimmed = content.trim();
  if (trimmed === "") {
    throw new DotsApiError(400, "dotsChatMessageEmpty");
  }
  return persistChatMessage(roomId, DotsChatSenderKind.AI, null, trimmed);
}
