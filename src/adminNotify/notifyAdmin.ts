import { BARK_NOTIFY_MAX_PER_MINUTE } from "../config.js";
import { sendBarkPush } from "./barkClient.js";
import type { AdminNotifyEvent, BarkLevel, NotifyCategory } from "./notifyTypes.js";

const GLOBAL_WINDOW_MS = 60_000;
/** Longest category cooldown — used to prune stale dedupe map entries. */
const DEDUPE_MAP_MAX_AGE_MS = 600_000;

const CATEGORY_COOLDOWN_MS: Readonly<Record<NotifyCategory, number>> = {
  crash: 60_000,
  room_created: 0,
  rate_limit: 300_000,
  quota_exceeded: 300_000,
  auth_burst: 300_000,
  internal_error: 300_000,
  llm_exhausted: 600_000
};

const globalSendTimestamps: number[] = [];
const lastSentByDedupeKey = new Map<string, number>();

/** Removes dedupe entries whose last send is older than the longest cooldown. */
function pruneDedupeMap(now: number): void {
  const cutoff = now - DEDUPE_MAP_MAX_AGE_MS;
  for (const [key, lastSent] of lastSentByDedupeKey) {
    if (lastSent < cutoff) {
      lastSentByDedupeKey.delete(key);
    }
  }
}

/** Returns true when the event should be suppressed by dedupe or global caps. */
function shouldSuppress(event: AdminNotifyEvent, now: number): boolean {
  pruneDedupeMap(now);
  const bypassGlobalCap = event.category === "crash";
  if (!bypassGlobalCap) {
    const recentGlobal = globalSendTimestamps.filter((timestamp) => now - timestamp < GLOBAL_WINDOW_MS);
    if (recentGlobal.length >= BARK_NOTIFY_MAX_PER_MINUTE) {
      return true;
    }
  }

  const dedupeKey = event.dedupeKey ?? (event.category === "room_created" ? undefined : event.category);
  if (dedupeKey === undefined) {
    return false;
  }

  const cooldownMs = CATEGORY_COOLDOWN_MS[event.category];
  if (cooldownMs <= 0) {
    return false;
  }

  const lastSent = lastSentByDedupeKey.get(dedupeKey);
  return lastSent !== undefined && now - lastSent < cooldownMs;
}

/** Records a successful send for dedupe and global rate tracking. */
function recordSend(event: AdminNotifyEvent, now: number): void {
  pruneDedupeMap(now);
  const cutoff = now - GLOBAL_WINDOW_MS;
  const pruned = globalSendTimestamps.filter((timestamp) => timestamp >= cutoff);
  pruned.push(now);
  globalSendTimestamps.length = 0;
  globalSendTimestamps.push(...pruned);

  const dedupeKey = event.dedupeKey ?? (event.category === "room_created" ? undefined : event.category);
  if (dedupeKey !== undefined && CATEGORY_COOLDOWN_MS[event.category] > 0) {
    lastSentByDedupeKey.set(dedupeKey, now);
  }
}

/** Builds the Bark push payload for an admin notify event. */
function barkPayloadForEvent(event: AdminNotifyEvent): Readonly<{
  title: string;
  body: string;
  level: BarkLevel;
}> {
  return {
    title: event.title,
    body: event.body,
    level: event.level ?? (event.category === "crash" ? "timeSensitive" : "active")
  };
}

/** Delivers a Bark push when not suppressed by dedupe or global caps. */
async function deliverNotify(event: AdminNotifyEvent, timeoutMs?: number): Promise<void> {
  const now = Date.now();
  if (shouldSuppress(event, now)) {
    return;
  }

  try {
    await sendBarkPush(barkPayloadForEvent(event), timeoutMs);
    recordSend(event, now);
  } catch (error: unknown) {
    console.error("Admin Bark notification failed:", error);
  }
}

/** Queues an admin push notification (fire-and-forget). */
export function notifyAdmin(event: AdminNotifyEvent): void {
  void deliverNotify(event);
}

/** Sends an admin push notification and awaits delivery (for crash handlers). */
export async function notifyAdminSync(event: AdminNotifyEvent, timeoutMs = 3000): Promise<void> {
  await deliverNotify(event, timeoutMs);
}
