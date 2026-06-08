import type OpenAI from "openai";

import type { DotsServerAction, GridPoint, PlayerId } from "../game-synced/types.js";

/** OpenAI tool definitions matching `DotsServerAction` variants. */
export const DOTS_SERVER_ACTION_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "COMMIT_PLACEMENT",
      description: "Place a dot on an empty, unblocked grid intersection.",
      parameters: {
        type: "object",
        properties: {
          point: {
            type: "object",
            properties: {
              r: { type: "integer", description: "Row index (0-based)." },
              c: { type: "integer", description: "Column index (0-based)." }
            },
            required: ["r", "c"]
          },
          by: { type: "string", enum: ["player0", "player1"] }
        },
        required: ["point", "by"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "COMMIT_CAPTURE",
      description:
        "Capture opponent dots by enclosing an area. Ring starts empty, visits adjacent own dots, closes on start.",
      parameters: {
        type: "object",
        properties: {
          ring: {
            type: "array",
            items: {
              type: "object",
              properties: {
                r: { type: "integer" },
                c: { type: "integer" }
              },
              required: ["r", "c"]
            },
            minItems: 3
          },
          by: { type: "string", enum: ["player0", "player1"] }
        },
        required: ["ring", "by"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "SURRENDER",
      description: "Surrender when winning is impossible or as a last resort.",
      parameters: {
        type: "object",
        properties: {
          by: { type: "string", enum: ["player0", "player1"] }
        },
        required: ["by"]
      }
    }
  }
];

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
