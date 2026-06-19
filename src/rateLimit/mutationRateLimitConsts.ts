import type { MutationRateLimitScope, RateLimitScopeConfig } from "./mutationRateLimitTypes.js";

/** Central registry of mutational rate limits — every scope in dotsRouter must appear here. */
export const MUTATION_RATE_LIMITS: Readonly<Record<MutationRateLimitScope, RateLimitScopeConfig>> = {
  register: { max: 10, windowMs: 15 * 60_000, keyKind: "ip", route: "POST /dots/sessions/register" },
  heartbeat: { max: 120, windowMs: 60_000, keyKind: "userId", route: "POST /dots/sessions/heartbeat" },
  patchMe: { max: 10, windowMs: 60_000, keyKind: "userId", route: "PATCH /dots/sessions/me" },
  deleteMe: { max: 3, windowMs: 60_000, keyKind: "userId", route: "DELETE /dots/sessions/me" },
  roomCreate: { max: 10, windowMs: 60 * 60_000, keyKind: "userId", route: "POST /dots/rooms" },
  patchRoom: { max: 20, windowMs: 60_000, keyKind: "userId", route: "PATCH /dots/rooms/:roomId" },
  join: { max: 20, windowMs: 60_000, keyKind: "userId", route: "POST /dots/rooms/:roomId/join" },
  leave: { max: 30, windowMs: 60_000, keyKind: "userId", route: "POST /dots/rooms/:roomId/leave" },
  start: { max: 10, windowMs: 60_000, keyKind: "userId", route: "POST /dots/rooms/:roomId/start" },
  commit: { max: 100, windowMs: 60_000, keyKind: "roomUser", route: "POST /dots/rooms/:roomId/actions/commit" },
  ai: { max: 5, windowMs: 60 * 60_000, keyKind: "userId", route: "POST /dots/rooms/:roomId/ai" },
  chatMessage: { max: 10, windowMs: 60_000, keyKind: "roomUser", route: "POST /dots/rooms/:roomId/chat/messages" },
  chatRead: { max: 120, windowMs: 60_000, keyKind: "userId", route: "POST /dots/rooms/:roomId/chat/read" }
};
