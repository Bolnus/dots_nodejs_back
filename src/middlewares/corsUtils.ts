import type { CorsOptions } from "cors";
import { FRONTEND_URLS } from "../config.js";

let allowedOrigins: string[];

/** Validates the request origin against the configured allow list. */
function isValidOrigin(
  requestOrigin: string | undefined,
  callback: (err: Error | null, origin?: string | boolean) => void
): void {
  if (!allowedOrigins) {
    allowedOrigins = FRONTEND_URLS;
  }
  if (!requestOrigin) {
    callback(null, allowedOrigins[0] || true);
    return;
  }

  if (allowedOrigins.indexOf(requestOrigin) === -1) {
    console.warn(`CORS error ${requestOrigin}`);
    const msg = "The CORS policy for this site does not allow access from the specified Origin.";
    callback(new Error(msg), false);
    return;
  }
  callback(null, requestOrigin);
}

/** Returns CORS options for the Express app. */
export function getCorsOptions(): CorsOptions {
  return {
    origin: isValidOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  };
}
