import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type CrashKind = "uncaughtException" | "unhandledRejection" | "startupError";

interface CrashReport {
  kind: CrashKind;
  timestamp: string;
  message: string;
  stack: string | undefined;
  pid: number;
  nodeVersion: string;
  platform: string;
  cwd: string;
  argv: string[];
  memoryUsage: NodeJS.MemoryUsage;
}

/** Resolves the project `logs/` directory (sibling of `src/` or `build/`). */
function getLogsDirectory(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return join(moduleDir, "..", "logs");
}

/** Formats an unknown thrown value as message and optional stack trace. */
function formatError(err: unknown): { message: string; stack: string | undefined } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err), stack: undefined };
}

/** Builds a unique crash report filename for the given kind. */
function buildCrashReportFilename(kind: CrashKind): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return `crash-${kind}-${timestamp}-${process.pid}.json`;
}

/** Writes a crash report JSON file to `logs/` and logs the path to stderr. */
export function writeCrashReport(kind: CrashKind, err: unknown): void {
  const { message, stack } = formatError(err);
  const report: CrashReport = {
    kind,
    timestamp: new Date().toISOString(),
    message,
    stack,
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    argv: process.argv,
    memoryUsage: process.memoryUsage()
  };

  const logsDir = getLogsDirectory();
  try {
    mkdirSync(logsDir, { recursive: true });
    const filePath = join(logsDir, buildCrashReportFilename(kind));
    writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.error(`Crash report written to ${filePath}`);
  } catch (writeError: unknown) {
    console.error("Failed to write crash report:", writeError);
    console.error("Original error:", err);
  }
}

/** Handles synchronous uncaught exceptions. */
function onUncaughtException(err: unknown): void {
  writeCrashReport("uncaughtException", err);
  process.exit(1);
}

/** Handles promise rejections that were not caught. */
function onUnhandledRejection(reason: unknown): void {
  writeCrashReport("unhandledRejection", reason);
  process.exit(1);
}

/** Registers process-level crash handlers that write reports under `logs/`. */
export function registerCrashReporting(): void {
  process.on("uncaughtException", onUncaughtException);
  process.on("unhandledRejection", onUnhandledRejection);
}
