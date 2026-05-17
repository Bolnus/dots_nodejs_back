import express, { type Express } from "express";
import cors from "cors";
import { Server } from "http";
import { getHelmetMiddleware } from "../middlewares/helmet.js";
import { getCorsOptions } from "../middlewares/corsUtils.js";
import { EXPRESS_HOST, EXPRESS_PORT } from "../config.js";
import { getStatus } from "./commonRequests.js";

export function createArcadeServer(): Express {
  const app = express().disable("x-powered-by");
  app.use(getHelmetMiddleware());
  app.use(express.json());
  app.use(cors(getCorsOptions()));
  app.set("trust proxy", 1);
  app.get("/", getStatus);
  return app;
}

export function startArcadeServer(): Server {
  const app = createArcadeServer();
  return app.listen(EXPRESS_PORT, EXPRESS_HOST, () =>
    console.log(`Admin API listening on http://${EXPRESS_HOST}:${EXPRESS_PORT}`)
  );
}
