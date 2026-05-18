import { WebSocketServer, type RawData, type WebSocket as WsSocket } from "ws";
import type { Server as HttpServer } from "node:http";

import type { DotsRoomEvent } from "./wireTypes.js";
import { authenticateBearer } from "./auth.js";
import { setRoomEventBroadcaster } from "./events.js";
import { applyEphemeral, getRoom } from "./roomService.js";

type ClientState = Readonly<{
  userId: string;
  roomId: string | null;
}>;

type InboundMessage = Readonly<{
  type?: string;
  token?: string;
  roomId?: string;
  patch?: unknown;
}>;

type MessageQueue = { processing: Promise<void> };

const roomChannels = new Map<string, Set<WsSocket>>();
const clientState = new WeakMap<WsSocket, ClientState>();

/** Adds a WebSocket to a room broadcast channel. */
function addToRoom(roomId: string, ws: WsSocket): void {
  let channel = roomChannels.get(roomId);
  if (!channel) {
    channel = new Set();
    roomChannels.set(roomId, channel);
  }
  channel.add(ws);
}

/** Removes a WebSocket from a room broadcast channel. */
function removeFromRoom(roomId: string, ws: WsSocket): void {
  const channel = roomChannels.get(roomId);
  channel?.delete(ws);
  if (channel && channel.size === 0) {
    roomChannels.delete(roomId);
  }
}

/** Delivers a room event to all subscribers on the channel. */
function deliverRoomEvent(roomId: string, event: DotsRoomEvent): void {
  const channel = roomChannels.get(roomId);
  if (!channel) {
    return;
  }
  const payload = JSON.stringify(event);
  for (const ws of channel) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload);
    }
  }
}

/** Converts a WebSocket message payload to UTF-8 text. */
function messageToText(raw: RawData): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (Buffer.isBuffer(raw)) {
    return raw.toString("utf8");
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }
  return Buffer.concat(raw).toString("utf8");
}

/** Handles one inbound WebSocket message (AUTH / SUBSCRIBE / PRESENCE). */
async function handleClientMessage(ws: WsSocket, raw: RawData): Promise<void> {
  const text = messageToText(raw);
  if (!text) {
    return;
  }
  const msg = JSON.parse(text) as InboundMessage;

  if (msg.type === "AUTH" && msg.token) {
    const user = await authenticateBearer(msg.token);
    if (!user) {
      ws.close();
      return;
    }
    clientState.set(ws, { userId: user.id, roomId: null });
    return;
  }

  const state = clientState.get(ws);
  if (!state?.userId) {
    return;
  }

  if (msg.type === "SUBSCRIBE" && msg.roomId) {
    if (state.roomId) {
      removeFromRoom(state.roomId, ws);
    }
    addToRoom(msg.roomId, ws);
    clientState.set(ws, { ...state, roomId: msg.roomId });
    const room = await getRoom(msg.roomId);
    ws.send(JSON.stringify({ type: "ROOM_STATE", room } satisfies DotsRoomEvent));
    return;
  }

  if (msg.type === "PRESENCE" && msg.roomId && msg.patch) {
    await applyEphemeral(state.userId, msg.roomId, msg.patch as Parameters<typeof applyEphemeral>[2]);
  }
}

/** Serializes WebSocket message handling per connection. */
function enqueueWebSocketMessage(queue: MessageQueue, ws: WsSocket, raw: RawData): void {
  queue.processing = queue.processing
    .then(() => handleClientMessage(ws, raw))
    .catch(() => {
      /* ignore malformed messages */
    });
}

/** Cleans up room subscription when a WebSocket closes. */
function onWebSocketClose(ws: WsSocket): void {
  const state = clientState.get(ws);
  if (state?.roomId) {
    removeFromRoom(state.roomId, ws);
  }
}

/** Wires message and close handlers for a new WebSocket client. */
function onWebSocketConnection(ws: WsSocket): void {
  clientState.set(ws, { userId: "", roomId: null });
  const queue: MessageQueue = { processing: Promise.resolve() };

  ws.on("message", (raw) => enqueueWebSocketMessage(queue, ws, raw));
  ws.on("close", () => onWebSocketClose(ws));
}

/** Attaches the dots WebSocket gateway to the HTTP server. */
export function attachDotsWebSocket(server: HttpServer): void {
  setRoomEventBroadcaster(deliverRoomEvent);
  const wss = new WebSocketServer({ server, path: "/dots/ws" });

  wss.on("connection", (ws) => onWebSocketConnection(ws));
}
