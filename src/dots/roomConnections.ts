/** In-memory WebSocket presence per room (ref-counted per user for multiple tabs). */
const roomConnectedCounts = new Map<string, Map<string, number>>();

/** Returns user ids currently subscribed to a room over WebSocket. */
export function getConnectedUserIds(roomId: string): string[] {
  const counts = roomConnectedCounts.get(roomId);
  if (!counts) {
    return [];
  }
  return [...counts.keys()];
}

/** Tracks a user's subscription to a room (ref-counted for multiple tabs). */
export function trackUserConnected(roomId: string, userId: string): void {
  let counts = roomConnectedCounts.get(roomId);
  if (!counts) {
    counts = new Map();
    roomConnectedCounts.set(roomId, counts);
  }
  counts.set(userId, (counts.get(userId) ?? 0) + 1);
}

/** Removes a user's subscription from a room; drops empty room entries. */
export function untrackUserConnected(roomId: string, userId: string): void {
  const counts = roomConnectedCounts.get(roomId);
  if (!counts) {
    return;
  }
  const next = (counts.get(userId) ?? 0) - 1;
  if (next <= 0) {
    counts.delete(userId);
  } else {
    counts.set(userId, next);
  }
  if (counts.size === 0) {
    roomConnectedCounts.delete(roomId);
  }
}
