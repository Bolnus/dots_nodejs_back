import { fileURLToPath } from "url";
import { dirname } from "path";
import { startArcadeServer } from "./webApi/webServer.js";

/** Starts the HTTP server and WebSocket gateway. */
function main(): void {
  const fileName = fileURLToPath(import.meta.url);
  const dirName = dirname(fileName);
  process.chdir(dirName);
  startArcadeServer();
}

/** Logs startup errors and sets a non-zero exit code. */
function reportMainError(err: unknown): void {
  console.error(err);
  process.exitCode = 1;
}

try {
  void main();
} catch (localError) {
  reportMainError(localError);
}
