import type { DotsServerAction, GridPoint, PlayerId } from "../game-synced/types.js";
import {
  COMMIT_CAPTURE_TOOL_ARGUMENTS_JSON,
  COMMIT_PLACEMENT_TOOL_ARGUMENTS_JSON,
  SURRENDER_TOOL_ARGUMENTS_JSON
} from "./llmGameConsts.js";

/** Parses a grid point from raw LLM tool arguments. */
function parseGridPoint(raw: unknown): GridPoint | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const row = record.r;
  const col = record.c;
  if (typeof row !== "number" || typeof col !== "number" || !Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }
  return { r: row, c: col };
}

/** Parses a player id from raw LLM tool arguments. */
function parsePlayerId(raw: unknown): PlayerId | null {
  return raw === "player0" || raw === "player1" ? raw : null;
}

/** Parses tool arguments JSON into a record or returns null. */
function parseToolArgsRecord(argsJson: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argsJson) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

/** Parses a COMMIT_PLACEMENT tool call. */
function parsePlacementAction(args: Record<string, unknown>): DotsServerAction | null {
  const point = parseGridPoint(args.point);
  const by = parsePlayerId(args.by);
  if (point === null || by === null) {
    return null;
  }
  return { type: "COMMIT_PLACEMENT", point, by };
}

/** Parses a COMMIT_CAPTURE tool call. */
function parseCaptureAction(args: Record<string, unknown>): DotsServerAction | null {
  const by = parsePlayerId(args.by);
  if (by === null || !Array.isArray(args.ring)) {
    return null;
  }
  const ring: GridPoint[] = [];
  for (const vertex of args.ring) {
    const point = parseGridPoint(vertex);
    if (point === null) {
      return null;
    }
    ring.push(point);
  }
  if (ring.length < 3) {
    return null;
  }
  return { type: "COMMIT_CAPTURE", ring, by };
}

/** Describes the JSON shape expected for a given tool name. */
export function describeExpectedToolArguments(toolName: string): string {
  switch (toolName) {
    case "COMMIT_PLACEMENT":
      return COMMIT_PLACEMENT_TOOL_ARGUMENTS_JSON;
    case "COMMIT_CAPTURE":
      return COMMIT_CAPTURE_TOOL_ARGUMENTS_JSON;
    case "SURRENDER":
      return SURRENDER_TOOL_ARGUMENTS_JSON;
    default:
      return "a valid JSON object for COMMIT_PLACEMENT, COMMIT_CAPTURE, or SURRENDER";
  }
}

/** Converts a validated OpenAI tool call into a `DotsServerAction`. */
export function parseDotsServerActionFromTool(toolName: string, argsJson: string): DotsServerAction | null {
  const args = parseToolArgsRecord(argsJson);
  if (args === null) {
    return null;
  }
  if (toolName === "COMMIT_PLACEMENT") {
    return parsePlacementAction(args);
  }
  if (toolName === "COMMIT_CAPTURE") {
    return parseCaptureAction(args);
  }
  if (toolName === "SURRENDER") {
    const by = parsePlayerId(args.by);
    return by === null ? null : { type: "SURRENDER", by };
  }
  return null;
}
