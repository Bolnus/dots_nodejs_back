import { createHash, randomBytes } from "node:crypto";

import { Prisma, type DotsUser } from "@prisma/client";

import { DOTS_IDLE_USER_TTL_HOURS } from "../config.js";
import { prisma } from "../db/prisma.js";
import { DotsApiError } from "./errors.js";
import { hasBlockingMembership } from "./membership.js";
import type { AuthUser } from "./wireTypes.js";

/** Hashes a bearer token for storage. */
function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Normalizes a display name for uniqueness checks. */
export function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase();
}

/** Creates a new opaque session token. */
export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** True when Prisma reports a unique-constraint violation. */
function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Re-authenticates an existing user or throws when active-room membership blocks it. */
async function reauthExistingUser(userId: string, displayName: string, sessionTokenHash: string): Promise<AuthUser> {
  const blocked = await hasBlockingMembership(userId);
  if (blocked) {
    throw new DotsApiError(409, "dotsActiveRoomBlocked");
  }
  return prisma.dotsUser.update({
    where: { id: userId },
    data: {
      displayName,
      sessionTokenHash,
      lastSeenAt: new Date()
    },
    select: { id: true, displayName: true }
  });
}

/** Deletes idle users who are not in active rooms. */
export async function purgeExpiredUsers(): Promise<void> {
  const cutoff = new Date(Date.now() - DOTS_IDLE_USER_TTL_HOURS * 60 * 60 * 1000);
  const stale = await prisma.dotsUser.findMany({
    where: { lastSeenAt: { lt: cutoff } },
    select: { id: true }
  });
  for (const user of stale) {
    const blocked = await hasBlockingMembership(user.id);
    if (!blocked) {
      await prisma.dotsUser.deleteMany({ where: { id: user.id } });
    }
  }
}

/** Resolves a bearer token to an authenticated user, updating last seen. */
export async function authenticateBearer(token: string | undefined): Promise<AuthUser | null> {
  await purgeExpiredUsers();
  if (!token?.trim()) {
    return null;
  }
  const sessionTokenHash = hashToken(token.trim());
  const user = await prisma.dotsUser.findFirst({
    where: { sessionTokenHash },
    select: { id: true, displayName: true }
  });
  if (!user) {
    return null;
  }
  await prisma.dotsUser.update({
    where: { id: user.id },
    data: { lastSeenAt: new Date() }
  });
  return { id: user.id, displayName: user.displayName };
}

/** Registers or re-authenticates a user by display name. */
export async function registerUser(displayName: string): Promise<{ user: AuthUser; token: string }> {
  const trimmed = displayName.trim();
  if (!trimmed) {
    throw new DotsApiError(400, "dotsInternal");
  }
  const normalizedName = normalizeDisplayName(trimmed);
  const token = createSessionToken();
  const sessionTokenHash = hashToken(token);

  const existing = await prisma.dotsUser.findUnique({ where: { normalizedName } });
  if (existing) {
    const user = await reauthExistingUser(existing.id, trimmed, sessionTokenHash);
    return { user, token };
  }

  try {
    const user = await prisma.dotsUser.create({
      data: {
        displayName: trimmed,
        normalizedName,
        sessionTokenHash,
        lastSeenAt: new Date()
      },
      select: { id: true, displayName: true }
    });
    return { user, token };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    const raced = await prisma.dotsUser.findUnique({ where: { normalizedName } });
    if (!raced) {
      throw error;
    }
    const user = await reauthExistingUser(raced.id, trimmed, sessionTokenHash);
    return { user, token };
  }
}

/** Updates the user's last seen timestamp. */
export async function touchUser(userId: string): Promise<void> {
  await prisma.dotsUser.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() }
  });
}

/** Hashes a room password for storage. */
export function hashPassword(password: string): string {
  return createHash("sha256").update(password, "utf8").digest("hex");
}

/** Verifies a room password against its stored hash. */
export function verifyPassword(password: string, passwordHash: string | null): boolean {
  if (passwordHash === null) {
    return true;
  }
  return hashPassword(password) === passwordHash;
}

export type UserRow = DotsUser;
