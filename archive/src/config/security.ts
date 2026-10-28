import type { Request, Response } from "express";

import { isProduction } from "../env.js";

/**
 * When false (default in production), Redis errors block rate limit / dedupe instead of allowing traffic.
 */
export function redisGuardFailOpen(): boolean {
  const raw = process.env.MAGNUS_REDIS_GUARD_FAIL_OPEN?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return !isProduction();
}

/** New Telegram users are allowlisted only when explicitly enabled (default false). */
export function autoAllowlistNewUsers(): boolean {
  const raw = process.env.MAGNUS_AUTO_ALLOWLIST_NEW_USERS?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function internalJobSecret(): string | undefined {
  const s = process.env.MAGNUS_INTERNAL_JOB_SECRET?.trim();
  return s || undefined;
}

/**
 * OAuth diagnostic JSON (`GET /oauth/google`, `/oauth/notion`, `/oauth/kite`).
 * Dev: open. Production: requires `Authorization: Bearer MAGNUS_INTERNAL_JOB_SECRET`.
 */
export function allowOAuthDiagnostics(req: Request): boolean {
  if (!isProduction()) {
    return true;
  }
  const secret = internalJobSecret();
  if (!secret) {
    return false;
  }
  return req.get("authorization")?.trim() === `Bearer ${secret}`;
}

/** Returns false after sending 404 (hide route in production without auth). */
export function rejectUnlessOAuthDiagnosticsAllowed(
  req: Request,
  res: Response,
): boolean {
  if (allowOAuthDiagnostics(req)) {
    return true;
  }
  res.status(404).json({ error: "not_found" });
  return false;
}
