import type { DotsRoomEvent } from "./wireTypes.js";

let broadcastFn: ((roomId: string, event: DotsRoomEvent) => void) | null = null;

/** Registers the function used to broadcast room events to WebSocket clients. */
export function setRoomEventBroadcaster(fn: (roomId: string, event: DotsRoomEvent) => void): void {
  broadcastFn = fn;
}

/** Broadcasts a room event when a broadcaster is configured. */
export function broadcastRoomEvent(roomId: string, event: DotsRoomEvent): void {
  broadcastFn?.(roomId, event);
}
