import axios from "axios";

import { BARK_DEVICE_KEY, BARK_SERVER_URL } from "../config.js";
import type { BarkLevel } from "./notifyTypes.js";

const BARK_REQUEST_TIMEOUT_MS = 5000;

type BarkPushPayload = Readonly<{
  title: string;
  body: string;
  level?: BarkLevel;
  group?: string;
}>;

/** Sends a push notification to the admin Bark device via axios. */
export async function sendBarkPush(payload: BarkPushPayload, timeoutMs = BARK_REQUEST_TIMEOUT_MS): Promise<void> {
  const body = {
    device_key: BARK_DEVICE_KEY,
    title: payload.title,
    body: payload.body,
    group: payload.group ?? "dots-admin",
    level: payload.level ?? "active"
  };
  await axios.post(`${BARK_SERVER_URL}/push`, body, {
    timeout: timeoutMs,
    headers: barkJsonHeaders()
  });
}

/** Returns JSON headers for Bark API requests. */
function barkJsonHeaders(): Readonly<Record<string, string>> {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- HTTP header name
  return { "Content-Type": "application/json; charset=utf-8" };
}
