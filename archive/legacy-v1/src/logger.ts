import pino from "pino";

import { isProduction } from "./env.js";

const level =
  process.env.LOG_LEVEL?.trim() || (isProduction() ? "info" : "debug");

/** JSON logs (pipe through `npx pino-pretty` locally if you want colors). */
export const logger = pino({
  level,
  redact: {
    paths: [
      "req.headers.authorization",
      "*.password",
      "*.apiKey",
      "*.token",
      "telegramToken",
    ],
    remove: true,
  },
});

/** Safe for logs in production (short suffix only). */
export function maskTelegramUserId(telegramUserId: string): string {
  const s = String(telegramUserId);
  if (!isProduction()) {
    return s;
  }
  if (s.length <= 4) {
    return "…";
  }
  return `…${s.slice(-4)}`;
}
