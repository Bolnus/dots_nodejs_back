import dotenv from "dotenv";

dotenv.config();

/** Reads a required environment variable (trimmed) or throws. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

/** Reads an optional environment variable and returns a trimmed value (or undefined). */
function optionalTrimmed(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Reads an optional numeric environment variable with a fallback. */
function optionalNumber(name: string, fallback: number): number {
  const raw = optionalTrimmed(name);
  if (raw === undefined) {
    return fallback;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Reads an optional string environment variable with a fallback. */
function optionalString(name: string, fallback: string): string {
  return optionalTrimmed(name) ?? fallback;
}

/** Removes trailing `/` characters from a URL-like string. */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function getEnvFrontendUrls(): string[] {
  try {
    const data = JSON.parse(process.env.FRONTEND_URLS || "") as unknown;
    const urls = (data as { urls?: unknown[] })?.urls;
    if (Array.isArray(urls)) {
      return urls.map(String);
    }
  } catch (localErr) {
    console.warn(localErr);
  }
  return [];
}

export const EXPRESS_HOST = optionalString("EXPRESS_HOST", "0.0.0.0");
export const EXPRESS_PORT = optionalNumber("EXPRESS_PORT", 3030);
export const DATABASE_CONNECTION_STRING = required("DATABASE_URL");
export const FRONTEND_URLS = getEnvFrontendUrls();
