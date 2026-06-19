/** Identifiers for mutational endpoint rate-limit scopes. */
export type MutationRateLimitScope =
  | "register"
  | "heartbeat"
  | "patchMe"
  | "deleteMe"
  | "roomCreate"
  | "patchRoom"
  | "join"
  | "leave"
  | "start"
  | "commit"
  | "ai"
  | "chatMessage"
  | "chatRead";

/** How to derive the rate-limit bucket key from a request. */
export type RateLimitKeyKind = "ip" | "userId" | "roomUser";

/** Rate-limit configuration for one mutational scope. */
export type RateLimitScopeConfig = Readonly<{
  max: number;
  windowMs: number;
  keyKind: RateLimitKeyKind;
  route: string;
}>;

/** In-memory sliding-window bucket for one scope key. */
export type RateLimitEntry = Readonly<{ timestamps: number[] }>;
