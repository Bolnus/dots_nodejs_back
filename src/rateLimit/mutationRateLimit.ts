import type { NextFunction, Response as ExpressResponse } from "express";

import { notifyAdmin } from "../adminNotify/notifyAdmin.js";
import { DotsApiError, sendDotsError } from "../dots/errors.js";
import { roomIdParam } from "../dots/dotsRequest.js";
import type { DotsErrorCode, DotsRequest } from "../dots/wireTypes.js";
import { MUTATION_RATE_LIMITS } from "./mutationRateLimitConsts.js";
import type {
  MutationRateLimitScope,
  RateLimitEntry,
  RateLimitKeyKind,
  RateLimitScopeConfig
} from "./mutationRateLimitTypes.js";

type AssertMutationRateLimitOptions = Readonly<{
  errorCode?: DotsErrorCode;
  route?: string;
}>;

const rateLimitByScopeKey = new Map<string, RateLimitEntry>();

/** Builds the storage key for a scope and bucket identifier. */
function buildStorageKey(scope: MutationRateLimitScope, bucketKey: string): string {
  return `${scope}:${bucketKey}`;
}

/** Resolves the client IP from an Express request. */
function resolveClientIp(req: DotsRequest): string {
  return req.ip ?? "unknown";
}

/** Resolves the rate-limit bucket key for a request from the scope config. */
function resolveRateLimitKey(req: DotsRequest, keyKind: RateLimitKeyKind): string {
  switch (keyKind) {
    case "ip":
      return resolveClientIp(req);
    case "userId":
      return req.dotsUser?.id ?? resolveClientIp(req);
    case "roomUser":
      return `${roomIdParam(req)}:${req.dotsUser?.id ?? resolveClientIp(req)}`;
    default: {
      const unreachable: never = keyKind;
      return unreachable;
    }
  }
}

/** Notifies the admin that a rate limit was exceeded. */
function notifyRateLimitExceeded(scope: MutationRateLimitScope, bucketKey: string, route: string): void {
  notifyAdmin({
    category: "rate_limit",
    title: "Dots: rate limit",
    body: `${route}\nKey: ${bucketKey}`,
    dedupeKey: `rate:${route}:${bucketKey}`
  });
}

/** Enforces a mutational rate limit and throws when exceeded. */
export function assertMutationRateLimit(
  scope: MutationRateLimitScope,
  bucketKey: string,
  options?: AssertMutationRateLimitOptions
): void {
  const config = MUTATION_RATE_LIMITS[scope];
  const storageKey = buildStorageKey(scope, bucketKey);
  const now = Date.now();
  const entry = rateLimitByScopeKey.get(storageKey);
  const recent = (entry?.timestamps ?? []).filter((timestamp) => now - timestamp < config.windowMs);

  if (recent.length >= config.max) {
    const route = options?.route ?? config.route;
    notifyRateLimitExceeded(scope, bucketKey, route);
    throw new DotsApiError(429, options?.errorCode ?? "dotsRateLimited");
  }

  rateLimitByScopeKey.set(storageKey, { timestamps: [...recent, now] });
}

/** Runs rate-limit middleware for one mutational scope. */
function runMutationRateLimitMiddleware(
  scope: MutationRateLimitScope,
  config: RateLimitScopeConfig,
  req: DotsRequest,
  res: ExpressResponse,
  next: NextFunction
): void {
  try {
    const bucketKey = resolveRateLimitKey(req, config.keyKind);
    assertMutationRateLimit(scope, bucketKey);
    next();
  } catch (error: unknown) {
    if (error instanceof DotsApiError) {
      sendDotsError(res, req.languageCode, error);
      return;
    }
    next(error);
  }
}

/** Express middleware that enforces a mutational rate limit for the given scope. */
export function mutationRateLimit(scope: MutationRateLimitScope) {
  const config = MUTATION_RATE_LIMITS[scope];
  return (req: DotsRequest, res: ExpressResponse, next: NextFunction): void =>
    runMutationRateLimitMiddleware(scope, config, req, res, next);
}
