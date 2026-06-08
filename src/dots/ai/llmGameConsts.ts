import type OpenAI from "openai";

/** JSON Schema for COMMIT_PLACEMENT tool arguments. */
export const COMMIT_PLACEMENT_TOOL_ARGUMENTS = {
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
} as const;

/** JSON Schema for COMMIT_CAPTURE tool arguments. */
export const COMMIT_CAPTURE_TOOL_ARGUMENTS = {
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
} as const;

/** JSON Schema for SURRENDER tool arguments. */
export const SURRENDER_TOOL_ARGUMENTS = {
  type: "object",
  properties: {
    by: { type: "string", enum: ["player0", "player1"] }
  },
  required: ["by"]
} as const;

/** Stringified COMMIT_PLACEMENT tool arguments schema for LLM retry messages. */
export const COMMIT_PLACEMENT_TOOL_ARGUMENTS_JSON = JSON.stringify(COMMIT_PLACEMENT_TOOL_ARGUMENTS);

/** Stringified COMMIT_CAPTURE tool arguments schema for LLM retry messages. */
export const COMMIT_CAPTURE_TOOL_ARGUMENTS_JSON = JSON.stringify(COMMIT_CAPTURE_TOOL_ARGUMENTS);

/** Stringified SURRENDER tool arguments schema for LLM retry messages. */
export const SURRENDER_TOOL_ARGUMENTS_JSON = JSON.stringify(SURRENDER_TOOL_ARGUMENTS);

/** OpenAI tool definitions matching `DotsServerAction` variants. */
export const DOTS_SERVER_ACTION_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "COMMIT_PLACEMENT",
      description: "Place a dot on an empty, unblocked grid intersection.",
      parameters: COMMIT_PLACEMENT_TOOL_ARGUMENTS
    }
  },
  {
    type: "function",
    function: {
      name: "COMMIT_CAPTURE",
      description:
        "Capture opponent dots by enclosing an area. Ring starts empty, visits adjacent own dots, closes on start.",
      parameters: COMMIT_CAPTURE_TOOL_ARGUMENTS
    }
  },
  {
    type: "function",
    function: {
      name: "SURRENDER",
      description: "Surrender when winning is impossible or as a last resort.",
      parameters: SURRENDER_TOOL_ARGUMENTS
    }
  }
];
