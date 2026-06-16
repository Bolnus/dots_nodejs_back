import { DotsChatSenderKind, DotsRoomMemberRole, DotsRoomStatus } from "@prisma/client";

import { prisma } from "../db/prisma.js";
import { broadcastRoomEvent } from "./events.js";
import { DotsApiError } from "./errors.js";
import { loadRoom } from "./roomService.js";
import type {
  DotsChatMessage,
  DotsChatReadState,
  DotsChatSenderKind as WireChatSenderKind,
  ListChatMessagesResult
} from "./wireTypes.js";

export const MAX_CHAT_MESSAGE_LENGTH = 500;
const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 200;
const RATE_LIMIT_MAX_MESSAGES = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

type RateLimitEntry = Readonly<{ timestamps: number[] }>;

const rateLimitByRoomUser = new Map<string, RateLimitEntry>();

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

/** True when the user may read chat history in the room. */
function canReadChat(room: Awaited<ReturnType<typeof loadRoom>>, userId: string): boolean {
  const isMember = room.members.some((member) => member.userId === userId);
  if (isMember) {
    return true;
  }
  if (room.status !== DotsRoomStatus.FINISHED) {
    return false;
  }
  return userId === room.lockedPlayer0UserId || userId === room.lockedPlayer1UserId;
}

/** Ensures the user may read chat or throws. */
async function assertChatReadAccess(roomId: string, userId: string): Promise<void> {
  const room = await loadRoom(roomId);
  if (!canReadChat(room, userId)) {
    throw new DotsApiError(403, "dotsNotInRoom");
  }
}

/** Ensures the user is a room member or throws. */
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

/** Validates message content length after trim. */
function assertMessageLength(content: string): void {
  if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new DotsApiError(400, "dotsChatMessageTooLong", { max: String(MAX_CHAT_MESSAGE_LENGTH) });
  }
}

/** Enforces per-user rate limit for posting chat messages in a room. */
function assertRateLimit(roomId: string, userId: string): void {
  const key = `${roomId}:${userId}`;
  const now = Date.now();
  const entry = rateLimitByRoomUser.get(key);
  const recent = (entry?.timestamps ?? []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_MESSAGES) {
    throw new DotsApiError(429, "dotsChatRateLimited");
  }
  rateLimitByRoomUser.set(key, { timestamps: [...recent, now] });
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
  broadcastRoomEvent(roomId, { type: "CHAT_MESSAGE", roomId, message });
  return message;
}

/** Loads read states for all members of a chat. */
async function loadReadStates(chatId: string): Promise<readonly DotsChatReadState[]> {
  const rows = await prisma.dotsChatReadState.findMany({
    where: { chatId },
    select: { userId: true, lastReadAtMs: true }
  });
  return rows.map((row) => ({ userId: row.userId, lastReadAtMs: Number(row.lastReadAtMs) }));
}

/** Returns paginated chat messages and read states for a room member. */
export async function listChatMessages(
  roomId: string,
  userId: string,
  afterMs: number | undefined,
  beforeMs: number | undefined,
  limit: number | undefined
): Promise<ListChatMessagesResult> {
  await assertChatReadAccess(roomId, userId);
  const chat = await loadChatForRoom(roomId);
  const take = Math.min(Math.max(limit ?? DEFAULT_MESSAGE_LIMIT, 1), MAX_MESSAGE_LIMIT);
  const readStates = await loadReadStates(chat.id);

  if (afterMs !== undefined && beforeMs !== undefined) {
    throw new DotsApiError(400, "dotsInternal");
  }

  if (afterMs !== undefined && Number.isFinite(afterMs)) {
    const afterDate = new Date(afterMs);
    const rows = await prisma.dotsChatMessage.findMany({
      where: { chatId: chat.id, createdAt: { gt: afterDate } },
      orderBy: { createdAt: "asc" },
      take: take + 1,
      include: { senderUser: { select: { displayName: true } } }
    });
    const hasMoreAfter = rows.length > take;
    const page = hasMoreAfter ? rows.slice(0, take) : rows;
    return {
      messages: page.map(mapChatMessage),
      hasMoreBefore: false,
      hasMoreAfter,
      readStates
    };
  }

  if (beforeMs !== undefined && Number.isFinite(beforeMs)) {
    const beforeDate = new Date(beforeMs);
    const rows = await prisma.dotsChatMessage.findMany({
      where: { chatId: chat.id, createdAt: { lt: beforeDate } },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      include: { senderUser: { select: { displayName: true } } }
    });
    const hasMoreBefore = rows.length > take;
    const page = (hasMoreBefore ? rows.slice(0, take) : rows).reverse();
    return {
      messages: page.map(mapChatMessage),
      hasMoreBefore,
      hasMoreAfter: false,
      readStates
    };
  }

  const rows = await prisma.dotsChatMessage.findMany({
    where: { chatId: chat.id },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    include: { senderUser: { select: { displayName: true } } }
  });
  const hasMoreBefore = rows.length > take;
  const page = (hasMoreBefore ? rows.slice(0, take) : rows).reverse();
  return {
    messages: page.map(mapChatMessage),
    hasMoreBefore,
    hasMoreAfter: false,
    readStates
  };
}

/** Stores a human chat message from a room member (not forwarded to the LLM). */
export async function postChatMessage(roomId: string, userId: string, content: string): Promise<DotsChatMessage> {
  const trimmed = content.trim();
  if (trimmed === "") {
    throw new DotsApiError(400, "dotsChatMessageEmpty");
  }
  assertMessageLength(trimmed);
  assertRateLimit(roomId, userId);
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

/** Updates the read cursor for a room member and broadcasts the change. */
export async function markChatRead(roomId: string, userId: string, lastReadAtMs: number): Promise<void> {
  if (!Number.isFinite(lastReadAtMs) || lastReadAtMs < 0) {
    throw new DotsApiError(400, "dotsInternal");
  }
  await assertChatReadAccess(roomId, userId);
  const chat = await loadChatForRoom(roomId);
  await prisma.dotsChatReadState.upsert({
    where: { chatId_userId: { chatId: chat.id, userId } },
    create: { chatId: chat.id, userId, lastReadAtMs: BigInt(Math.floor(lastReadAtMs)) },
    update: { lastReadAtMs: BigInt(Math.floor(lastReadAtMs)) }
  });
  broadcastRoomEvent(roomId, { type: "CHAT_READ", roomId, userId, lastReadAtMs: Math.floor(lastReadAtMs) });
}

/** Broadcasts a typing indicator for a room member. */
export async function broadcastChatTyping(roomId: string, userId: string): Promise<void> {
  await assertRoomMember(roomId, userId);
  const room = await loadRoom(roomId);
  const member = room.members.find((entry) => entry.userId === userId);
  if (!member) {
    throw new DotsApiError(403, "dotsNotInRoom");
  }
  const { user } = member;
  broadcastRoomEvent(roomId, {
    type: "CHAT_TYPING",
    roomId,
    userId,
    displayName: user.displayName
  });
}
