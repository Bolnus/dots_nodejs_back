import express, { type Express } from "express";
import cors from "cors";
import { createServer, type Server } from "http";
import { getHelmetMiddleware } from "./middlewares/helmet.js";
import { getCorsOptions } from "./middlewares/corsUtils.js";
import { EXPRESS_HOST, EXPRESS_PORT } from "./config.js";
import { resumeInterruptedAiTurns } from "./dots/appInit.js";
import { attachDotsWebSocket } from "./dots/wsGateway.js";
import { getStatus } from "./commonWebApi/commonRequests.js";
import { createDotsRouter } from "./dots/webApi/dotsRouter.js";

/** Runs startup tasks after the HTTP server is listening. */
function onArcadeServerListening(): void {
  console.log(`${new Date().toISOString()} Dots API listening on http://${EXPRESS_HOST}:${EXPRESS_PORT}`);
  void resumeInterruptedAiTurns().catch((error: unknown) => console.error("Resume AI turns failed", error));
}

/** Creates the Express application with dots routes and middleware. */
export function createArcadeServer(): Express {
  const app = express().disable("x-powered-by");
  app.use(getHelmetMiddleware());
  app.use(express.json());
  app.use(cors(getCorsOptions()));
  app.set("trust proxy", 1);
  app.get("/", getStatus);
  app.use("/dots", createDotsRouter());
  return app;
}

/** Listens for HTTP and attaches the dots WebSocket server. */
export function startArcadeServer(): Server {
  const app = createArcadeServer();
  const server = createServer(app);
  attachDotsWebSocket(server);
  server.listen(EXPRESS_PORT, EXPRESS_HOST, () => void onArcadeServerListening());
  return server;
}
