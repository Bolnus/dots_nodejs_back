import { fileURLToPath } from "url";
import { dirname } from "path";
import { registerCrashReporting, writeCrashReport } from "./crashReporting.js";
import { startArcadeServer } from "./webServer.js";

registerCrashReporting();

/** Starts the HTTP server and WebSocket gateway. */
function main(): void {
  const fileName = fileURLToPath(import.meta.url);
  const dirName = dirname(fileName);
  process.chdir(dirName);
  startArcadeServer();
}

/** Logs startup errors, writes a crash report, and sets a non-zero exit code. */
function reportMainError(err: unknown): void {
  console.error(err);
  writeCrashReport("startupError", err);
  process.exitCode = 1;
}

try {
  void main();
} catch (localError) {
  reportMainError(localError);
}
