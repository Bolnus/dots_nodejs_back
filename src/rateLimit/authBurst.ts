import { notifyAdmin } from "../adminNotify/notifyAdmin.js";
import type { DotsRequest } from "../dots/wireTypes.js";

const AUTH_BURST_WINDOW_MS = 5 * 60_000;
const AUTH_BURST_THRESHOLD = 10;

type FailureEntry = Readonly<{ timestamps: number[] }>;

const failuresByIp = new Map<string, FailureEntry>();

/** Resolves the client IP from an Express request. */
function resolveClientIp(req: DotsRequest): string {
  return req.ip ?? "unknown";
}

/** Records a failed bearer authentication and notifies the admin on burst. */
export function recordAuthFailure(req: DotsRequest): void {
  const ip = resolveClientIp(req);
  const now = Date.now();
  const entry = failuresByIp.get(ip);
  const recent = (entry?.timestamps ?? []).filter((timestamp) => now - timestamp < AUTH_BURST_WINDOW_MS);
  const updated = [...recent, now];

  failuresByIp.set(ip, { timestamps: updated });

  if (updated.length >= AUTH_BURST_THRESHOLD) {
    notifyAdmin({
      category: "auth_burst",
      title: "Dots: auth failures",
      body: `${updated.length} failed bearer attempts from ${ip} in 5 minutes.`,
      dedupeKey: `auth:${ip}`
    });
  }
}
