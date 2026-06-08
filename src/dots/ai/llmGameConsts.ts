import type OpenAI from "openai";

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
