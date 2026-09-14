import express from "express";

import { maintenanceStatus } from "./maintenance.js";

export type HealthServer = {
  close: () => Promise<void>;
};

function listenPort(): number {
  const raw = process.env.HEALTH_PORT ?? process.env.PORT ?? "8080";
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 8080;
}

export function startHealthServer(): Promise<HealthServer> {
  const app = express();
  app.disable("x-powered-by");

  const body = maintenanceStatus();

  app.get("/health", (_req, res) => {
    res.status(200).json(body);
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json(body);
  });

  return new Promise((resolve) => {
    const server = app.listen(listenPort(), () => {
      resolve({
        close: () =>
          new Promise((done, reject) => {
            server.close((err) => (err ? reject(err) : done()));
          }),
      });
    });
  });
}
