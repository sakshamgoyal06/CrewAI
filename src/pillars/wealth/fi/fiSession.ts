import { randomUUID } from "node:crypto";

import { redis } from "../../../tools/clients.js";
import { fiMcpSessionTtlSec } from "./fiEnv.js";

const SESSION_PREFIX = "magnus:fi_mcp:session:";
const AUTH_AT_PREFIX = "magnus:fi_mcp:auth_at:";

function sessionKey(userProfileId: string): string {
  return `${SESSION_PREFIX}${userProfileId}`;
}

function authAtKey(userProfileId: string): string {
  return `${AUTH_AT_PREFIX}${userProfileId}`;
}

export function newFiMcpSessionId(): string {
  return `mcp-session-${randomUUID()}`;
}

export async function getFiMcpSessionId(userProfileId: string): Promise<string | undefined> {
  const raw = await redis.get<string>(sessionKey(userProfileId));
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export async function saveFiMcpSessionId(
  userProfileId: string,
  sessionId: string,
): Promise<void> {
  const ttl = fiMcpSessionTtlSec();
  await redis.set(sessionKey(userProfileId), sessionId, { ex: ttl });
}

export async function getOrCreateFiMcpSessionId(userProfileId: string): Promise<string> {
  const existing = await getFiMcpSessionId(userProfileId);
  if (existing) {
    return existing;
  }
  const sessionId = newFiMcpSessionId();
  await saveFiMcpSessionId(userProfileId, sessionId);
  return sessionId;
}

export async function markFiMcpAuthenticated(userProfileId: string): Promise<void> {
  const ttl = fiMcpSessionTtlSec();
  await redis.set(authAtKey(userProfileId), new Date().toISOString(), { ex: ttl });
}

export async function getFiMcpAuthenticatedAt(userProfileId: string): Promise<string | undefined> {
  const raw = await redis.get<string>(authAtKey(userProfileId));
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export async function clearFiMcpSession(userProfileId: string): Promise<void> {
  await redis.del(sessionKey(userProfileId));
  await redis.del(authAtKey(userProfileId));
}

export function isFiMcpAuthFresh(authenticatedAt?: string): boolean {
  if (!authenticatedAt) {
    return false;
  }
  const at = Date.parse(authenticatedAt);
  if (Number.isNaN(at)) {
    return false;
  }
  return Date.now() - at < fiMcpSessionTtlSec() * 1000;
}
