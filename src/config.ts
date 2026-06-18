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

/** Parses allowed frontend origins from the environment. */
function getEnvFrontendUrls(): string[] {
  try {
    const urls = process.env.FRONTEND_URLS?.split(",");
    if (Array.isArray(urls)) {
      return urls.map(String);
    }
  } catch (localErr) {
    console.warn(localErr);
  }
  return [];
}

/** Removes trailing `/` characters from a URL-like string. */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

export const EXPRESS_HOST = optionalString("EXPRESS_HOST", "0.0.0.0");
export const EXPRESS_PORT = optionalNumber("EXPRESS_PORT", optionalNumber("PORT", 3030));
export const DATABASE_CONNECTION_STRING = required("DATABASE_URL");
export const FRONTEND_URLS = getEnvFrontendUrls();
export const DOTS_MAX_ACTIVE_ROOMS = optionalNumber("DOTS_MAX_ACTIVE_ROOMS", 30);
export const DOTS_IDLE_USER_TTL_HOURS = optionalNumber("DOTS_IDLE_USER_TTL_HOURS", 24);

export const LLM_MODEL = required("LLM_MODEL");
/** OpenAI-compatible base URL for chat completions (Ollama: `http://localhost:11434/v1`). */
export const LLM_HOST = stripTrailingSlashes(required("LLM_HOST"));
/** Ollama ignores the key for local use; required by the OpenAI client. */
export const LLM_API_KEY = optionalString("LLM_API_KEY", "ollama");
export const LLM_OPTIONS = {
  temperature: optionalNumber("LLM_TEMPERATURE", 0.7),
  top_p: optionalNumber("LLM_TOP_P", 0.9),
  top_k: optionalNumber("LLM_TOP_K", 40),
  num_ctx: optionalNumber("LLM_NUM_CTX", 8192)
} as const;
/** Maximum LLM retry attempts per AI turn before the AI surrenders. */
export const LLM_MAX_RETRIES = optionalNumber("LLM_MAX_RETRIES", 3);

export const TELEGRAM_BOT_TOKEN = `${required("TELEGRAM_BOT_ID")}:${required("TELEGRAM_BOT_SECRET")}`;
export const TELEGRAM_UPDATE_METHOD = optionalString("TELEGRAM_UPDATE_METHOD", "long_polling");
export const TELEGRAM_RATE_LIMIT_WINDOW_MS = optionalNumber("TELEGRAM_RATE_LIMIT_WINDOW_MS", 10_000);
export const TELEGRAM_RATE_LIMIT_MAX = optionalNumber("TELEGRAM_RATE_LIMIT_MAX", 6);
