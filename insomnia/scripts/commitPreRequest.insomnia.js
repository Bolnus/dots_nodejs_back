// Insomnia pre-request script for POST .../actions/commit
// Logic synced with src/dots/game-synced/{fnv1a,serverState,serverReducer,logic}.ts

const FNV1A_OFFSET_BASIS_32 = 0x811c9dc5;
const FNV1A_PRIME_32 = 0x01000193;

function fnv1a32Hex(input) {
  let hash = FNV1A_OFFSET_BASIS_32;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV1A_PRIME_32) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalizeServerState(state) {
  const cellRows = state.cells.map((row) =>
    row.map((cell) => `${cell.owner ?? "_"}${cell.blocked ? "1" : "0"}`).join(",")
  );
  const polygons = state.polygons.map((poly) => ({
    owner: poly.owner,
    ring: poly.ring.map((p) => [p.r, p.c])
  }));
  return JSON.stringify({
    config: { rows: state.config.rows, cols: state.config.cols },
    cells: cellRows,
    dotsPlacedCount: state.dotsPlacedCount,
    scores: { player0: state.scores.player0, player1: state.scores.player1 },
    mode: state.mode,
    winner: state.winner,
    surrenderedBy: state.surrenderedBy,
    polygons,
    version: state.version
  });
}

function computeServerStateHash(state) {
  return fnv1a32Hex(canonicalizeServerState(state));
}

function dotKey(r, c) {
  return `${r},${c}`;
}

function pointInPolygon(test, polygonRing) {
  if (polygonRing.length < 3) {
    return false;
  }
  const x = test.c + 0.5;
  const y = -(test.r + 0.5);
  let wn = 0;
  const n = polygonRing.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const yi = -(polygonRing[i].r + 0.5);
    const xi = polygonRing[i].c + 0.5;
    const yj = -(polygonRing[j].r + 0.5);
    const xj = polygonRing[j].c + 0.5;
    const cross = (xj - xi) * (y - yi) - (x - xi) * (yj - yi);
    if (yi <= y) {
      if (yj > y && cross > 0) {
        wn++;
      }
    } else if (yj <= y && cross < 0) {
      wn--;
    }
  }
  return wn !== 0;
}

function isRingVertex(p, ring) {
  for (const v of ring) {
    if (v.r === p.r && v.c === p.c) {
      return true;
    }
  }
  return false;
}

function isGridPointOnClosedSegment(p, a, b) {
  if (a.r === b.r && a.c === b.c) {
    return p.r === a.r && p.c === a.c;
  }
  const cross = (b.c - a.c) * (p.r - a.r) - (b.r - a.r) * (p.c - a.c);
  if (cross !== 0) {
    return false;
  }
  return (
    p.r >= Math.min(a.r, b.r) &&
    p.r <= Math.max(a.r, b.r) &&
    p.c >= Math.min(a.c, b.c) &&
    p.c <= Math.max(a.c, b.c)
  );
}

function isOnPolygonBoundary(p, ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    if (isGridPointOnClosedSegment(p, ring[i], ring[(i + 1) % n])) {
      return true;
    }
  }
  return false;
}

function isStrictlyInteriorDot(p, ring) {
  if (ring.length < 3) {
    return false;
  }
  if (isRingVertex(p, ring)) {
    return false;
  }
  if (isOnPolygonBoundary(p, ring)) {
    return false;
  }
  return pointInPolygon(p, ring);
}

function computeInteriorDotKeys(ring, dotRows, dotCols) {
  const interior = new Set();
  if (ring.length < 3 || dotRows < 1 || dotCols < 1) {
    return interior;
  }
  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      const p = { r, c };
      if (isStrictlyInteriorDot(p, ring)) {
        interior.add(dotKey(r, c));
      }
    }
  }
  return interior;
}

function polygonDoubledAbsArea(ring) {
  const n = ring.length;
  if (n < 3) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = ring[i].c + 0.5;
    const yi = -(ring[i].r + 0.5);
    const xj = ring[j].c + 0.5;
    const yj = -(ring[j].r + 0.5);
    sum += xi * yj - xj * yi;
  }
  return Math.abs(sum);
}

function indexOfOutermostPolygonContaining(key, interiorByPoly, doubledArea) {
  let bestIdx = -1;
  let bestArea = -1;
  for (let i = 0; i < interiorByPoly.length; i++) {
    if (!interiorByPoly[i].has(key)) {
      continue;
    }
    const a = doubledArea[i];
    if (a > bestArea || (a === bestArea && (bestIdx === -1 || i < bestIdx))) {
      bestArea = a;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function computeScoresFromGridAndPolygons(cells, polygons) {
  const scores = { player0: 0, player1: 0 };
  const dotRows = cells.length;
  const dotCols = cells[0]?.length ?? 0;
  if (dotRows < 1 || dotCols < 1 || polygons.length === 0) {
    return scores;
  }
  const interiorByPoly = [];
  const doubledArea = [];
  for (const poly of polygons) {
    interiorByPoly.push(computeInteriorDotKeys(poly.ring, dotRows, dotCols));
    doubledArea.push(polygonDoubledAbsArea(poly.ring));
  }
  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      const cell = cells[r][c];
      if (cell.owner === null) {
        continue;
      }
      const bestIdx = indexOfOutermostPolygonContaining(dotKey(r, c), interiorByPoly, doubledArea);
      if (bestIdx === -1) {
        continue;
      }
      const polyOwner = polygons[bestIdx].owner;
      if (cell.owner !== polyOwner) {
        scores[polyOwner]++;
      }
    }
  }
  return scores;
}

function computeCapture(cells, ring, capturer) {
  if (ring.length < 3) {
    return null;
  }
  const dotRows = cells.length;
  const dotCols = cells[0]?.length ?? 0;
  const interiorKeys = computeInteriorDotKeys(ring, dotRows, dotCols);
  const opponent = capturer === "player0" ? "player1" : "player0";
  const scoredDots = [];
  const blockedCells = [];
  for (let r = 0; r < dotRows; r++) {
    for (let c = 0; c < dotCols; c++) {
      if (!interiorKeys.has(dotKey(r, c))) {
        continue;
      }
      const p = { r, c };
      const cell = cells[r][c];
      blockedCells.push(p);
      if (cell.owner === opponent) {
        scoredDots.push(p);
      }
    }
  }
  if (scoredDots.length === 0) {
    return null;
  }
  return { ring: [...ring], scoredDots, blockedCells };
}

function applyCapture(grid, capture) {
  const next = grid.map((row) => row.map((cell) => ({ ...cell })));
  for (const { r, c } of capture.blockedCells) {
    const cell = next[r][c];
    next[r][c] = { owner: cell.owner, blocked: true };
  }
  return next;
}

function currentServerPlacingPlayer(state) {
  return state.dotsPlacedCount % 2 === 0 ? "player0" : "player1";
}

function cellsWithDot(cells, point, owner) {
  return cells.map((row, rowIndex) =>
    row.map((existing, colIndex) =>
      rowIndex === point.r && colIndex === point.c ? { owner, blocked: false } : existing
    )
  );
}

function withHashAndVersion(next) {
  const bumped = { ...next, version: next.version + 1 };
  return { ...bumped, hash: computeServerStateHash(bumped) };
}

function reject(state, reason) {
  return { ok: false, reason, state };
}

function accept(state) {
  return { ok: true, state };
}

function applyCommitPlacement(state, point, by) {
  if (state.mode !== "play") {
    return reject(state, "gameNotInPlay");
  }
  if (currentServerPlacingPlayer(state) !== by) {
    return reject(state, "notYourTurn");
  }
  const targetCell = state.cells[point.r]?.[point.c];
  if (!targetCell || targetCell.blocked || targetCell.owner !== null) {
    return reject(state, "invalidPlacementCell");
  }
  const cells = cellsWithDot(state.cells, point, by);
  return accept(
    withHashAndVersion({
      ...state,
      cells,
      dotsPlacedCount: state.dotsPlacedCount + 1
    })
  );
}

function ringVerticesAreOwn(cells, ring, by) {
  for (let idx = 1; idx < ring.length; idx++) {
    const vertex = ring[idx];
    const vertexCell = cells[vertex.r]?.[vertex.c];
    if (!vertexCell || vertexCell.owner !== by || vertexCell.blocked) {
      return false;
    }
  }
  return true;
}

function applyCommitCapture(state, ring, by) {
  if (state.mode !== "play") {
    return reject(state, "gameNotInPlay");
  }
  if (currentServerPlacingPlayer(state) !== by) {
    return reject(state, "notYourTurn");
  }
  if (ring.length < 3) {
    return reject(state, "captureRingTooShort");
  }
  const [starter] = ring;
  const starterCell = state.cells[starter.r]?.[starter.c];
  if (!starterCell || starterCell.blocked || starterCell.owner !== null) {
    return reject(state, "invalidCaptureStarter");
  }
  const cellsWithStarter = cellsWithDot(state.cells, starter, by);
  if (!ringVerticesAreOwn(cellsWithStarter, ring, by)) {
    return reject(state, "captureRingVerticesInvalid");
  }
  const capture = computeCapture(cellsWithStarter, ring, by);
  if (!capture) {
    return reject(state, "invalidCapture");
  }
  const cellsAfter = applyCapture(cellsWithStarter, capture);
  const newPolygon = { owner: by, ring: capture.ring };
  const polygons = [...state.polygons, newPolygon];
  const scores = computeScoresFromGridAndPolygons(cellsAfter, polygons);
  return accept(
    withHashAndVersion({
      ...state,
      cells: cellsAfter,
      scores,
      polygons,
      dotsPlacedCount: state.dotsPlacedCount + 1
    })
  );
}

function applySurrender(state, by) {
  if (state.mode !== "play") {
    return reject(state, "gameNotInPlay");
  }
  const winner = by === "player0" ? "player1" : "player0";
  return accept(
    withHashAndVersion({
      ...state,
      mode: "ended",
      winner,
      surrenderedBy: by
    })
  );
}

function hasPlayableCell(cells) {
  for (const row of cells) {
    for (const cell of row) {
      if (!cell.blocked && cell.owner === null) {
        return true;
      }
    }
  }
  return false;
}

function maybeEndOnBoardFull(state) {
  if (state.mode !== "play" || hasPlayableCell(state.cells)) {
    return state;
  }
  const { player0, player1 } = state.scores;
  let winner = null;
  if (player0 > player1) {
    winner = "player0";
  } else if (player1 > player0) {
    winner = "player1";
  }
  return withHashAndVersion({
    ...state,
    mode: "ended",
    winner,
    surrenderedBy: null
  });
}

function reduceServer(state, action) {
  switch (action.type) {
    case "COMMIT_PLACEMENT": {
      const placement = applyCommitPlacement(state, action.point, action.by);
      if (!placement.ok) {
        return placement;
      }
      return accept(maybeEndOnBoardFull(placement.state));
    }
    case "COMMIT_CAPTURE": {
      const capture = applyCommitCapture(state, action.ring, action.by);
      if (!capture.ok) {
        return capture;
      }
      return accept(maybeEndOnBoardFull(capture.state));
    }
    case "SURRENDER":
      return applySurrender(state, action.by);
    default:
      return reject(state, "invalidAction");
  }
}

function sendDotsRequest(req) {
  return new Promise((resolve, reject) => {
    insomnia.sendRequest(req, (err, resp) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(resp);
    });
  });
}

function readRequestJsonBody() {
  const requestBody = insomnia.request.body ?? {};
  const raw =
    (typeof requestBody.raw === "string" && requestBody.raw) ||
    (typeof requestBody.text === "string" && requestBody.text) ||
    "";

  console.log("[commit] body mode:", requestBody.mode ?? "(none)");
  console.log("[commit] raw length:", raw.length);

  if (!raw.trim()) {
    throw new Error(
      "Commit body is empty. Open the Body tab and ensure JSON with action is present."
    );
  }

  const rendered = insomnia.environment.replaceIn(raw);
  console.log("[commit] rendered body preview:", rendered.slice(0, 120));
  return JSON.parse(rendered);
}

function writeRequestJsonBody(body) {
  const raw = JSON.stringify(body, null, 2);
  insomnia.request.body.update({
    mode: "raw",
    raw
  });
  console.log("[commit] wrote body with hashes:", {
    prevHash: body.prevHash,
    expectedNextHash: body.expectedNextHash
  });
  console.log("[commit] request.body.raw length after update:", insomnia.request.body?.raw?.length ?? 0);
}

async function fetchRoomServerState() {
  const baseUrl = insomnia.environment.get("base_url");
  const roomId = insomnia.environment.get("room_id");
  if (!roomId) {
    throw new Error("Set room_id in the active environment.");
  }

  const response = await sendDotsRequest({
    url: `${baseUrl}/dots/rooms/${roomId}`,
    method: "GET",
    header: {
      "Accept-Language": insomnia.environment.get("accept_language") || "en"
    }
  });

  const status = response.code ?? response.status;
  if (status >= 400) {
    throw new Error(`GET room failed (${status}): ${response.body}`);
  }

  const room = JSON.parse(response.body);
  if (!room.serverState) {
    throw new Error("Room has no serverState. Start the game first.");
  }
  return room.serverState;
}

console.log("[commit] pre-request script started");

const body = readRequestJsonBody();
if (!body.action?.type) {
  throw new Error("Commit body.action is required.");
}

console.log("[commit] action type:", body.action.type);

const state = await fetchRoomServerState();
console.log("[commit] serverState.hash:", state.hash);

const reduced = reduceServer(state, body.action);
if (!reduced.ok) {
  throw new Error(`Reducer rejected action: ${reduced.reason}`);
}

body.prevHash = state.hash;
body.expectedNextHash = reduced.state.hash;
writeRequestJsonBody(body);

insomnia.environment.set("prev_hash", body.prevHash);
insomnia.environment.set("expected_next_hash", body.expectedNextHash);

console.log("[commit] pre-request script finished");
