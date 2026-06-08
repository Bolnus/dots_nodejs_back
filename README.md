# dots_nodejs_back

HTTP API and WebSocket gateway for online **Dots** (точки) multiplayer: sessions, rooms, authoritative game state, and realtime updates.

Default base URL: `http://0.0.0.0:3030` (see `EXPRESS_HOST` / `EXPRESS_PORT`).

---

## Quick start

```bash
cp .env.example .env
# Edit DATABASE_URL, FRONTEND_URLS, LLM_HOST, LLM_MODEL, …

npm install
npm run prisma:migrate
npm start
```

| Script | Description |
|--------|-------------|
| `npm start` | Dev server (`tsx watch src/main.ts`) |
| `npm run build` | Compile TypeScript to `build/` |
| `npm run start:prod` | Run migrations + `node build/main.js` |
| `npm run prisma:migrate` | Apply dev migrations |
| `npm run prisma:migrate:deploy` | Apply migrations in production |

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | yes | — | PostgreSQL connection string |
| `FRONTEND_URLS` | yes | — | Comma-separated CORS allowed origins |
| `LLM_HOST` | yes | — | Ollama (or compatible) base URL, e.g. `http://localhost:11434` |
| `LLM_MODEL` | yes | — | Model name for internal LLM client |
| `EXPRESS_HOST` | no | `0.0.0.0` | HTTP bind host |
| `EXPRESS_PORT` / `PORT` | no | `3030` | HTTP port |
| `DOTS_MAX_ACTIVE_ROOMS` | no | `30` | Cap on `waiting` + `playing` rooms |
| `DOTS_IDLE_USER_TTL_HOURS` | no | `24` | Idle users without active membership may be purged |
| `LLM_API_KEY` | no | `ollama` | API key for OpenAI-compatible client |
| `LLM_TEMPERATURE`, `LLM_TOP_P`, `LLM_TOP_K`, `LLM_NUM_CTX` | no | see `src/config.ts` | LLM sampling / context |
| `LLM_MAX_RETRIES` | no | `3` | AI turn retries before surrender |

---

## General conventions

### Content type

REST handlers expect and return **JSON** (`Content-Type: application/json`), except `GET /` (HTML health page) and `DELETE` endpoints that respond with **204 No Content**.

### Localization

Send `Accept-Language` (e.g. `en`, `ru`) on REST requests. Error responses include a localized `messageLocal` field.

### Authentication

Protected routes require:

```http
Authorization: Bearer <session_token>
```

The token is a 64-character hex string returned by `POST /dots/sessions/register`. It is stored server-side as a SHA-256 hash. Invalid or missing tokens yield **401** with code `dotsUnauthorized`.

Routes **without** auth: `POST /dots/sessions/register`, `GET /dots/rooms`, `GET /dots/rooms/:roomId`.

### Error response

```json
{
  "code": "dotsRoomNotFound",
  "messageLocal": "Room not found."
}
```

| HTTP | Code | When |
|------|------|------|
| 400 | `dotsInternal` | Invalid body / generic bad request |
| 400 | `dotsInvalidGrid` | Board `rows` / `cols` outside 3–60 |
| 401 | `dotsUnauthorized` | Missing or invalid bearer token |
| 403 | `dotsWrongPassword` | Room password mismatch |
| 403 | `dotsOwnerOnly` | Not the room owner |
| 404 | `dotsRoomNotFound` | Unknown `roomId` |
| 409 | `dotsNameTaken` | Display name already used (PATCH me) |
| 409 | `dotsActiveRoomBlocked` | User in active room as owner/player |
| 409 | `dotsMaxRooms` | Global active room cap reached |
| 409 | `dotsSettingsLocked` | PATCH room while not `waiting` |
| 409 | `dotsNeedTwoPlayers` | Start without two players |
| 409 | `dotsPlayingLocked` | Join as player while game in progress (use viewer) |
| 409 | `dotsAiSlotTaken` | Second player slot already occupied |
| 403 | `dotsNotInRoom` | Chat access without room membership |
| 400 | `dotsChatMessageEmpty` | Empty chat message body |
| 503 | `dotsLlmUnavailable` | LLM model not configured |
| 500 | `dotsInternal` | Unhandled server error |

---

## REST API

### Health

#### `GET /`

HTML status page (“Backend online”). No JSON.

---

### Sessions

#### `POST /dots/sessions/register`

Register a new user or re-authenticate an existing display name (case-insensitive). Issues a new session token.

**Auth:** none

**Body:**

```json
{
  "displayName": "Alice"
}
```

**Response `200`:**

```json
{
  "userId": "uuid",
  "displayName": "Alice",
  "token": "64-char-hex"
}
```

**Errors:** `400` (`dotsInternal`), `409` (`dotsActiveRoomBlocked` if the name exists and the user is blocked by active room membership).

---

#### `PATCH /dots/sessions/me`

Rename the authenticated user.

**Auth:** required

**Body:**

```json
{
  "displayName": "Alice2"
}
```

**Response `200`:**

```json
{
  "userId": "uuid",
  "displayName": "Alice2"
}
```

**Errors:** `400`, `401`, `409` (`dotsNameTaken`, `dotsActiveRoomBlocked`).

---

#### `DELETE /dots/sessions/me`

Delete the authenticated user (when not blocked by active membership).

**Auth:** required

**Response:** `204` (empty body)

**Errors:** `401`, `409` (`dotsActiveRoomBlocked`).

---

#### `POST /dots/sessions/heartbeat`

Refresh `lastSeenAt` and report whether the user is in an active **playing** room (for reconnect UX).

**Auth:** required

**Body:** empty or `{}`

**Response `200`:**

```json
{
  "activeRoom": null
}
```

or

```json
{
  "activeRoom": {
    "id": "room-uuid",
    "status": "playing"
  }
}
```

**Errors:** `401` (empty body, no JSON envelope).

---

### Rooms

#### `GET /dots/rooms`

List all rooms (newest first).

**Auth:** none

**Response `200`:** array of `DotsRoomSummary`:

```json
[
  {
    "id": "uuid",
    "name": "Room",
    "ownerUserId": "uuid",
    "ownerName": "Alice",
    "isPrivate": false,
    "hasPassword": false,
    "config": { "rows": 10, "cols": 10 },
    "status": "waiting",
    "playerCount": 1,
    "maxPlayers": 2,
    "viewerCount": 0,
    "createdAtMs": 1710000000000
  }
]
```

`status`: `"waiting"` | `"playing"` | `"finished"`.

---

#### `POST /dots/rooms`

Create a room; creator becomes `player0`.

**Auth:** required

**Body:**

```json
{
  "name": "My room",
  "config": { "rows": 10, "cols": 10 },
  "isPrivate": false,
  "password": "optional-if-private"
}
```

Grid dimensions must be integers from **3** to **60** inclusive.

**Response `201`:** `DotsRoomDetail` (see [Room detail](#room-detail-dotsroomdetail)).

Also broadcasts `ROOM_STATE` on the room WebSocket channel.

**Errors:** `400`, `401`, `409` (`dotsMaxRooms`, `dotsActiveRoomBlocked`, `dotsInvalidGrid`).

---

#### `GET /dots/rooms/:roomId`

Fetch one room.

**Auth:** none

**Response `200`:** `DotsRoomDetail`

**Errors:** `404` (`dotsRoomNotFound`).

---

#### `PATCH /dots/rooms/:roomId`

Update settings or kick a member. **Owner only**, room must be `waiting`.

**Auth:** required

**Body** (all fields optional):

```json
{
  "config": { "rows": 12, "cols": 12 },
  "isPrivate": true,
  "password": "new-or-empty-to-clear",
  "kickUserId": "uuid"
}
```

**Response `200`:** `DotsRoomDetail`

Broadcasts `STATE_DELTA` to subscribers.

**Errors:** `401`, `403`, `404`, `409` (`dotsSettingsLocked`, `dotsOwnerOnly`, `dotsInvalidGrid`).

---

#### `POST /dots/rooms/:roomId/join`

Join as player or viewer.

**Auth:** required

**Body:**

```json
{
  "password": "",
  "asViewer": false
}
```

- **Waiting room:** `asViewer: false` assigns `player0` / `player1` if a slot is free; otherwise joins as viewer. `asViewer: true` joins as viewer.
- **Playing room:** new users must use `asViewer: true` unless they are a **locked** player reconnecting.
- **Password:** required when the room has `hasPassword: true` (empty string if no password).

**Response `200`:** `DotsRoomDetail`

Broadcasts `STATE_DELTA`.

**Errors:** `401`, `403` (`dotsWrongPassword`), `404`, `409` (`dotsPlayingLocked`).

---

#### `POST /dots/rooms/:roomId/leave`

Leave the room.

**Auth:** required

**Body:** empty

**Response:** `204`

**Behavior:**

- **Playing:** no-op (locked players stay in the game).
- **Finished:** removes membership.
- **Waiting, owner:** deletes the room; subscribers get `STATE_DELTA` with `status: "finished"`.
- **Waiting, non-owner:** removes membership; `STATE_DELTA`.

---

#### `POST /dots/rooms/:roomId/start`

Start the game. **Owner only**, requires two players (`player0` + `player1`).

**Auth:** required

**Body:** empty

**Response `200`:** `DotsRoomDetail` with `status: "playing"` and initial `serverState`.

Broadcasts `STATE_DELTA`.

**Errors:** `401`, `403`, `404`, `409` (`dotsNeedTwoPlayers`, `dotsOwnerOnly`).

---

#### `POST /dots/rooms/:roomId/actions/commit`

Commit an authoritative game action with hash chain validation.

**Auth:** required (must be a **locked** player for the action)

**Body:**

```json
{
  "action": { "type": "COMMIT_PLACEMENT", "point": { "r": 0, "c": 0 }, "by": "player0" },
  "prevHash": "current-server-state-hash",
  "expectedNextHash": "hash-after-reducer"
}
```

**Action types:**

| `type` | Fields | Notes |
|--------|--------|-------|
| `COMMIT_PLACEMENT` | `point: { r, c }`, `by: "player0" \| "player1"` | Place a dot on turn |
| `COMMIT_CAPTURE` | `ring: GridPoint[]`, `by` | Close a polygon |
| `SURRENDER` | `by` | End game; `by` must match caller’s slot |

**Response `200`:**

Success:

```json
{ "status": "ok" }
```

Rejection (still `200`):

```json
{
  "status": "rejected",
  "reason": "prevHash",
  "messageLocal": "Your game state is out of date. The board has been refreshed.",
  "snapshot": { }
}
```

`messageLocal` is optional on the wire type; the server includes it on every rejection, localized via `Accept-Language` (same locale rules as HTTP error bodies).

`reason`:

| Value | When |
|-------|------|
| `prevHash` | Client `prevHash` does not match current server state |
| `badHash` | Reducer output hash does not match client `expectedNextHash` |
| `notAuthorized` | Caller is not allowed to commit this action (locked-player / turn gate) |
| `notInGame` | Room is not in `playing` or has no `serverState` |
| `gameNotInPlay` | `serverState.mode` is not `"play"` |
| `notYourTurn` | `action.by` is not the current placing player |
| `placementPointOutOfBounds` | Placement coordinates are outside the board grid |
| `placementCellBlocked` | Placement target is blocked (captured interior) |
| `placementCellOccupied` | Placement target already has a dot |
| `captureRingTooShort` | Capture ring has fewer than 3 vertices |
| `invalidCaptureStarter` | Capture starter cell is missing, blocked, or already owned |
| `captureRingVerticesInvalid` | Non-starter ring vertices are not own unblocked dots |
| `captureRingNotConnected` | Consecutive ring vertices (including last → first) are not king neighbours |
| `invalidCapture` | Enclosure geometry fails server capture rules |

On success, broadcasts `STATE_DELTA`. When the game ends (`serverState.mode === "ended"`), room becomes `finished` and locked player memberships are released.

**Errors:** `400`, `401`, `404`.

After a successful human commit, the server may schedule an AI opponent turn when the room has an AI player and it is their turn.

---

#### `POST /dots/rooms/:roomId/ai`

Add an AI opponent to the second player slot (`player1`). **Owner only**, room must be `waiting`, and `player1` must be free.

**Auth:** required

**Body:** empty

**Response `200`:**

```json
{
  "modelName": "llama3.2",
  "room": { }
}
```

`modelName` is the configured `LLM_MODEL`. The AI appears in `players` with `user.isAi: true` and the model name as `displayName`.

Broadcasts `STATE_DELTA`.

**Errors:** `401`, `403`, `404`, `409` (`dotsAiSlotTaken`, `dotsOwnerOnly`, `dotsSettingsLocked`), `503` (`dotsLlmUnavailable`).

Kicking the AI uses `PATCH /dots/rooms/:roomId` with `kickUserId` set to the AI user's id.

---

#### `GET /dots/rooms/:roomId/chat/messages`

List chat messages for a room. **Room members only** (players or viewers).

**Auth:** required

**Query:** `afterMs` (optional, epoch ms cursor), `limit` (optional, default 50, max 200)

**Response `200`:**

```json
{
  "messages": [
    {
      "id": "uuid",
      "senderKind": "player",
      "senderUserId": "uuid",
      "senderDisplayName": "Alice",
      "content": "Hello",
      "createdAtMs": 1710000000000
    }
  ]
}
```

`senderKind`: `"ai"` | `"player"` | `"viewer"`. AI messages have `senderUserId: null`.

**Errors:** `401`, `403` (`dotsNotInRoom`), `404`.

---

#### `POST /dots/rooms/:roomId/chat/messages`

Post a chat message. **Not forwarded to the LLM.**

**Auth:** required (room member)

**Body:**

```json
{
  "content": "Hello"
}
```

**Response `201`:** `DotsChatMessage`

Broadcasts `CHAT_MESSAGE` to WebSocket subscribers.

**Errors:** `400` (`dotsChatMessageEmpty`), `401`, `403`, `404`.

---

### Room detail (`DotsRoomDetail`)

```json
{
  "id": "uuid",
  "name": "Room",
  "ownerUserId": "uuid",
  "isPrivate": false,
  "hasPassword": false,
  "status": "waiting",
  "players": [
    { "slot": "player0", "user": { "userId": "uuid", "displayName": "Alice" } },
    { "slot": "player1", "user": { "userId": "uuid", "displayName": "llama3.2", "isAi": true } }
  ],
  "viewers": [
    { "userId": "uuid", "displayName": "Bob" }
  ],
  "config": { "rows": 10, "cols": 10 },
  "serverState": null,
  "presence": null,
  "presenceBy": null,
  "lockedPlayers": { "player0": "uuid", "player1": null },
  "connectedUserIds": ["uuid"],
  "createdAtMs": 1710000000000
}
```

### Server game state (`serverState`)

Present when `status` is `playing` or `finished`:

```json
{
  "config": { "rows": 10, "cols": 10 },
  "cells": [[{ "owner": null, "blocked": false }]],
  "dotsPlacedCount": 0,
  "scores": { "player0": 0, "player1": 0 },
  "mode": "play",
  "winner": null,
  "surrenderedBy": null,
  "polygons": [],
  "version": 0,
  "hash": "deterministic-checksum"
}
```

`mode`: `"play"` | `"ended"`.

### Ephemeral presence (`presence`)

In-flight UI for the acting player (not committed game state):

```json
{
  "mode": "play",
  "pendingDot": null,
  "chainStart": null,
  "chainPath": []
}
```

`mode`: `"play"` | `"drawPolygon"`. Updated via WebSocket `PRESENCE` (see below).

---

## WebSocket API

### Endpoint

```
ws://<host>:<port>/dots/ws
```

Same HTTP server as REST. Use `wss://` behind TLS.

### Connection flow

1. Open WebSocket.
2. Send **AUTH** with session token.
3. Send **SUBSCRIBE** with `roomId` to receive room events.
4. Optionally send **PRESENCE** while it is your turn during `playing`.

Messages are JSON text frames, one object per message. Malformed messages are ignored. Invalid **AUTH** closes the connection.

### Client → server messages

#### AUTH

Required before other messages take effect.

```json
{
  "type": "AUTH",
  "token": "<session_token from register>"
}
```

No explicit success frame; invalid token closes the socket.

---

#### SUBSCRIBE

Join a room broadcast channel. Replaces any previous subscription on the same connection.

```json
{
  "type": "SUBSCRIBE",
  "roomId": "uuid"
}
```

**Server reply** (unicast to this client):

```json
{
  "type": "ROOM_STATE",
  "room": { }
}
```

`room` is a full `DotsRoomDetail`. Other subscribers receive `STATE_DELTA` when connection counts change (`connectedUserIds`).

---

#### PRESENCE

Broadcast ephemeral UI state for the acting player only (same rules as REST commit turn gate).

```json
{
  "type": "PRESENCE",
  "roomId": "uuid",
  "patch": {
    "mode": "drawPolygon",
    "pendingDot": null,
    "chainStart": { "r": 1, "c": 2 },
    "chainPath": []
  }
}
```

Ignored if not authenticated, not subscribed to the room, room is not `playing`, or caller is not the current acting player.

Subscribers receive:

```json
{
  "type": "PRESENCE_DELTA",
  "room": { }
}
```

---

### Server → client events

All subscribed clients on a room channel receive the same payload.

| `type` | When |
|--------|------|
| `ROOM_STATE` | After `SUBSCRIBE` (to subscribing client only) or room creation snapshot |
| `STATE_DELTA` | Room/membership/settings/game state or `connectedUserIds` changed |
| `PRESENCE_DELTA` | Ephemeral `presence` updated |
| `CHAT_MESSAGE` | New chat message in the room |

**Event shape:**

```json
{
  "type": "STATE_DELTA",
  "room": { }
}
```

`room` is always a full `DotsRoomDetail` (not a partial patch). Clients should replace local room state from `room`.

**Chat event shape:**

```json
{
  "type": "CHAT_MESSAGE",
  "roomId": "uuid",
  "message": {
    "id": "uuid",
    "senderKind": "ai",
    "senderUserId": null,
    "senderDisplayName": null,
    "content": "Action: COMMIT_PLACEMENT …",
    "createdAtMs": 1710000000000
  }
}
```

### Disconnect

On close, the server removes the client from the room channel, updates `connectedUserIds`, and broadcasts `STATE_DELTA` to remaining subscribers.

---

## Architecture notes

- **Authoritative state:** committed moves go through `POST .../actions/commit`; the server reducer validates hashes and turn order.
- **Realtime:** REST mutations and WebSocket presence call `broadcastRoomEvent`; delivery is in-process via `ws` room channels.
- **CORS:** browser clients must use an origin listed in `FRONTEND_URLS`.
- **LLM / vs-AI:** `LLM_*` env vars configure an internal OpenAI-compatible client (`src/llm.ts`). AI turns use tool calling against `DotsServerAction`; moves are committed server-side without hash validation. `POST /dots/rooms/:roomId/ai` exposes the configured model name to clients.

---

## Related types

TypeScript definitions: `src/dots/wireTypes.ts`, `src/dots/game-synced/types.ts`, `src/dots/localStateWire.ts`.
