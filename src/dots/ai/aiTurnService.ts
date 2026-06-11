import { DotsRoomStatus } from "@prisma/client";

import { LLM_MAX_RETRIES } from "../../config.js";
import { chatWithLlmTools } from "../../llm.js";
import { postAiChatMessage } from "../chatService.js";
import { commitAction } from "../commitService.js";
import { currentServerPlacingPlayer } from "../game-synced/serverReducer.js";
import type { DotsServerAction, DotsServerGameState, PlayerId } from "../game-synced/types.js";
import { aiPlayerSlot } from "../aiPlayerService.js";
import { loadRoom } from "../roomService.js";
import { DOTS_SERVER_ACTION_TOOLS } from "./llmGameConsts.js";
import {
  buildCommitRejectedError,
  buildInvalidToolArgumentsError,
  buildLlmTurnMessages,
  buildMissingToolCallError
} from "./llmGamePrompts.js";
import { toLlmGameState } from "./llmGameState.js";
import type { LlmGameStatePayload } from "./llmGameTypes.js";
import { parseDotsServerActionFromTool } from "./llmGameTools.js";

const roomTurnLocks = new Map<string, Promise<void>>();

/** Returns true when it is the AI player's turn in an active game. */
function isAiTurn(room: Awaited<ReturnType<typeof loadRoom>>): boolean {
  if (room.status !== DotsRoomStatus.PLAYING || room.aiPlayerUserId === null || !room.serverState) {
    return false;
  }
  const state = room.serverState as DotsServerGameState;
  if (state.mode !== "play") {
    return false;
  }
  const slot = aiPlayerSlot(room);
  if (slot === null) {
    return false;
  }
  return currentServerPlacingPlayer(state) === slot;
}

/** Builds the chat text persisted after a successful AI action. */
function buildAiChatContent(toolName: string, assistantContent: string | null, action: DotsServerAction): string {
  const actionSummary = JSON.stringify(action);
  if (assistantContent !== null && assistantContent !== "") {
    return `${assistantContent}\nAction: ${toolName} ${actionSummary}`;
  }
  return `Action: ${toolName} ${actionSummary}`;
}

/** Applies a surrender action for the AI when retries are exhausted. */
async function forceAiSurrender(roomId: string, aiSlot: PlayerId): Promise<void> {
  const action: DotsServerAction = { type: "SURRENDER", by: aiSlot };
  await commitAction(roomId, undefined, action, { kind: "ai" });
  await postAiChatMessage(roomId, "AI surrendered after repeated failures.");
}

type AiTurnContext = Readonly<{
  aiSlot: PlayerId;
  gameState: LlmGameStatePayload;
}>;

/** Loads room context for an AI turn or returns null when the turn is no longer valid. */
async function loadAiTurnContext(roomId: string): Promise<AiTurnContext | null> {
  const room = await loadRoom(roomId);
  if (!isAiTurn(room)) {
    return null;
  }
  const aiSlot = aiPlayerSlot(room);
  if (aiSlot === null || !room.serverState) {
    return null;
  }
  const gameState = toLlmGameState(room, room.serverState as DotsServerGameState);
  if (gameState === null) {
    return null;
  }
  return { aiSlot, gameState };
}

/** Executes one LLM attempt; returns true when a move was committed. */
async function tryAiAttempt(roomId: string, context: AiTurnContext, priorErrors: string[]): Promise<boolean> {
  let toolResult;
  try {
    toolResult = await chatWithLlmTools(buildLlmTurnMessages(context.gameState, priorErrors), DOTS_SERVER_ACTION_TOOLS);
    if (priorErrors.length) {
      console.log("priorErrors", priorErrors);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "LLM request failed";
    priorErrors.push(message);
    return false;
  }

  if (!toolResult.hasToolCall || toolResult.toolName === null || toolResult.argumentsJson === null) {
    if (toolResult.assistantContent !== null && toolResult.assistantContent !== "") {
      await postAiChatMessage(roomId, toolResult.assistantContent);
    }
    priorErrors.push(buildMissingToolCallError(toolResult.assistantContent));
    return false;
  }

  const action = parseDotsServerActionFromTool(toolResult.toolName, toolResult.argumentsJson);
  if (action === null) {
    priorErrors.push(buildInvalidToolArgumentsError(toolResult.toolName, toolResult.argumentsJson));
    return false;
  }
  if (action.by !== context.aiSlot) {
    priorErrors.push(`Action must be by ${context.aiSlot}, got ${action.by}`);
    return false;
  }

  const result = await commitAction(roomId, undefined, action, { kind: "ai" });
  if (result.status === "rejected") {
    priorErrors.push(buildCommitRejectedError(result.reason, action));
    return false;
  }

  await postAiChatMessage(roomId, buildAiChatContent(toolResult.toolName, toolResult.assistantContent, action));
  return true;
}

/** Runs the LLM retry loop and commits the chosen action. */
async function runAiTurn(roomId: string): Promise<void> {
  const priorErrors: string[] = [];

  for (let attempt = 0; attempt < LLM_MAX_RETRIES; attempt += 1) {
    const context = await loadAiTurnContext(roomId);
    if (context === null) {
      return;
    }
    const succeeded = await tryAiAttempt(roomId, context, priorErrors);
    if (succeeded) {
      return;
    }
  }
  console.log("priorErrors", priorErrors);

  const room = await loadRoom(roomId);
  const aiSlot = aiPlayerSlot(room);
  if (aiSlot !== null && isAiTurn(room)) {
    await forceAiSurrender(roomId, aiSlot);
  }
}

/** Serializes AI turns per room so only one LLM call runs at a time. */
function withRoomTurnLock(roomId: string, task: () => Promise<void>): Promise<void> {
  const previous = roomTurnLocks.get(roomId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (roomTurnLocks.get(roomId) === next) {
        roomTurnLocks.delete(roomId);
      }
    });
  roomTurnLocks.set(roomId, next);
  return next;
}

/** Schedules an AI turn when the current acting player is the room's AI opponent. */
export function scheduleAiTurnIfNeeded(roomId: string): void {
  void withRoomTurnLock(roomId, async () => {
    try {
      const room = await loadRoom(roomId);
      if (!isAiTurn(room)) {
        return;
      }
      await runAiTurn(roomId);
    } catch (error: unknown) {
      console.error("AI turn failed for room", roomId, error);
    }
  });
}
