/**
 * Who is calling: turns an `Authorization: Bearer …` header into a user_profile id.
 *
 * Three kinds of bearer, checked in this order:
 *   1. The deploy owner's legacy token (`MAGNUS_HEALTH_APP_TOKEN`), so existing installs keep working.
 *   2. A personal token (`mgt_…`) a user created for a phone automation, stored hashed.
 *   3. A Supabase Auth access token from Google sign-in. The first sign-in creates the person's
 *      profile; `MAGNUS_OWNER_EMAIL` links the owner's Google account to the existing owner profile.
 *
 * The server talks to Postgres with the service role and scopes every query by the id returned here.
 */
import { createHash, randomBytes } from "node:crypto";

import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import { authenticateHealthApp, healthAppAuthConfig } from "./auth.js";

export const PERSONAL_TOKEN_PREFIX = "mgt_";

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

export type AuthUser = { id: string; email?: string | null; name?: string | null };

/**
 * What a bearer may do. `full`: the signed-in person (Google, the owner token, tokens made before
 * scopes existed). `ingest`: a device token (the Android app, a phone automation) that may only
 * send data in and ask whose account it is, so a token lifted off a phone can't read or delete
 * anything.
 */
export type TokenScope = "full" | "ingest";

/** Routes an `ingest` token may call (method + path under /api/health). */
const INGEST_ROUTES = new Set(["POST /ingest/health-connect", "POST /steps", "GET /whoami"]);

export function scopeAllows(scope: TokenScope, method: string, path: string): boolean {
  return scope === "full" || INGEST_ROUTES.has(`${method.toUpperCase()} ${path.replace(/\/+$/, "")}`);
}

/** Sign-up gate. `open` (default) lets anyone with a Google account in; `invite` only listed emails. */
export function signupAllowed(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = env.MAGNUS_SIGNUP_MODE?.trim().toLowerCase() || "open";
  if (mode !== "invite") return true;
  const list = (env.MAGNUS_INVITE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export function isOwnerEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  const owner = env.MAGNUS_OWNER_EMAIL?.trim().toLowerCase();
  return !!owner && !!email && owner === email.toLowerCase();
}

// The live project's publishable key. Public by design (it ships to every browser); kept here so
// Railway needs no extra variable. SUPABASE_PUBLISHABLE_KEY overrides it.
const LIVE_PROJECT_REF = "uktsxijrewbqjcjnrfdv";
const LIVE_PUBLISHABLE_KEY = "sb_publishable_xW0r5y9jY8XJbfNZopsOKQ_e43lp9Oe";

/** Public config the PWA needs before anyone signs in. The publishable key is meant to be public. */
export function publicAuthConfig(env: NodeJS.ProcessEnv = process.env): {
  supabaseUrl: string | null;
  supabaseKey: string | null;
  google: boolean;
} {
  const supabaseUrl = env.SUPABASE_URL?.trim() || null;
  const supabaseKey =
    env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    (supabaseUrl?.includes(LIVE_PROJECT_REF) ? LIVE_PUBLISHABLE_KEY : null) ||
    env.SUPABASE_ANON_KEY?.trim() ||
    null;
  return { supabaseUrl, supabaseKey, google: !!supabaseUrl && !!supabaseKey && env.MAGNUS_GOOGLE_SIGNIN !== "off" };
}

// ---------- token caches ----------

const CACHE_MS = 5 * 60_000;
type CacheEntry = { at: number; userProfileId: string | null; scope?: TokenScope };
const jwtCache = new Map<string, CacheEntry>();
const tokenCache = new Map<string, CacheEntry>();

function cachedEntry(map: Map<string, CacheEntry>, key: string): CacheEntry | undefined {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_MS) {
    map.delete(key);
    return undefined;
  }
  return hit;
}

function cached(map: Map<string, CacheEntry>, key: string): string | null | undefined {
  return cachedEntry(map, key)?.userProfileId;
}

function remember(map: Map<string, CacheEntry>, key: string, id: string | null, scope?: TokenScope): void {
  if (map.size > 5000) map.clear();
  map.set(key, { at: Date.now(), userProfileId: id, scope });
}

/** Forget cached lookups for a profile (after a delete or token revoke). */
export function forgetProfile(userProfileId: string): void {
  for (const map of [jwtCache, tokenCache]) {
    for (const [k, v] of map) if (v.userProfileId === userProfileId) map.delete(k);
  }
}

// ---------- profiles ----------

/** Finds or creates the profile for a signed-in Google account. Null when sign-up is closed to them. */
export async function profileForAuthUser(user: AuthUser, timezone?: string): Promise<string | null> {
  const existing = await supabase.from("user_profile").select("id").eq("auth_user_id", user.id).maybeSingle();
  if (existing.error) throw new Error(`read user_profile: ${existing.error.message}`);
  if (existing.data) return String(existing.data.id);

  // The owner's first Google sign-in claims the profile that already holds their history.
  const ownerId = healthAppAuthConfig()?.userProfileId;
  if (ownerId && isOwnerEmail(user.email)) {
    const claimed = await supabase
      .from("user_profile")
      .update({ auth_user_id: user.id, email: user.email ?? null })
      .eq("id", ownerId)
      .is("auth_user_id", null)
      .select("id")
      .maybeSingle();
    if (claimed.error) throw new Error(`claim owner profile: ${claimed.error.message}`);
    if (claimed.data) {
      logger.info({ userProfileId: ownerId }, "owner signed in with Google; linked to existing profile");
      return ownerId;
    }
  }

  if (!signupAllowed(user.email)) return null;

  const created = await supabase
    .from("user_profile")
    .insert({
      auth_user_id: user.id,
      email: user.email ?? null,
      display_name: user.name?.trim() || null,
      timezone: validTimezone(timezone) ?? "Asia/Kolkata",
      allowlisted: true,
    })
    .select("id")
    .single();
  if (created.error) {
    // Two first requests raced; the other one created it.
    const again = await supabase.from("user_profile").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (again.data) return String(again.data.id);
    throw new Error(`create user_profile: ${created.error.message}`);
  }
  const id = String(created.data.id);
  const hp = await supabase
    .from("user_health_profile")
    .upsert({ user_profile_id: id }, { onConflict: "user_profile_id", ignoreDuplicates: true });
  if (hp.error) logger.warn({ err: hp.error.message }, "create user_health_profile failed");
  logger.info({ userProfileId: id }, "new health app user");
  return id;
}

export function validTimezone(tz: string | undefined | null): string | null {
  if (!tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

async function userFromSupabaseJwt(jwt: string): Promise<AuthUser | null> {
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  return { id: data.user.id, email: data.user.email ?? null, name };
}

// ---------- personal tokens ----------

/** New tokens are device tokens (`ingest`): they feed data in and can't read the account. */
export async function createPersonalToken(userProfileId: string, label = "Health Connect", scope: TokenScope = "ingest"): Promise<string> {
  const token = `${PERSONAL_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  const row = { user_profile_id: userProfileId, token_hash: sha256(token), label: label.slice(0, 60) };
  let { error } = await supabase.from("health_app_tokens").insert({ ...row, scope });
  // Before the scope migration (20261104090000) is applied the column isn't there yet.
  if (error && /scope/.test(error.message)) ({ error } = await supabase.from("health_app_tokens").insert(row));
  if (error) throw new Error(`create token: ${error.message}`);
  return token;
}

/**
 * A new token for a device that replaces the one it had: tokens with the same label are revoked,
 * so reconnecting the Android app doesn't pile up live tokens.
 */
export async function replacePersonalToken(userProfileId: string, label: string): Promise<string> {
  const token = await createPersonalToken(userProfileId, label);
  const { error } = await supabase
    .from("health_app_tokens")
    .delete()
    .eq("user_profile_id", userProfileId)
    .eq("label", label.slice(0, 60))
    .neq("token_hash", sha256(token));
  if (error) throw new Error(`replace token: ${error.message}`);
  tokenCache.clear();
  return token;
}

export async function listPersonalTokens(
  userProfileId: string,
): Promise<{ id: string; label: string; createdAt: string; lastUsedAt: string | null }[]> {
  const { data, error } = await supabase
    .from("health_app_tokens")
    .select("id, label, created_at, last_used_at")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`list tokens: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    label: String(r.label),
    createdAt: String(r.created_at),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
  }));
}

export async function revokePersonalToken(userProfileId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("health_app_tokens")
    .delete()
    .eq("user_profile_id", userProfileId)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`revoke token: ${error.message}`);
  tokenCache.clear();
  return (data ?? []).length > 0;
}

async function profileForPersonalToken(token: string): Promise<{ id: string; scope: TokenScope } | null> {
  const hash = sha256(token);
  const hit = cachedEntry(tokenCache, hash);
  if (hit) return hit.userProfileId ? { id: hit.userProfileId, scope: hit.scope ?? "ingest" } : null;
  let { data, error } = await supabase
    .from("health_app_tokens")
    .select("id, user_profile_id, scope")
    .eq("token_hash", hash)
    .maybeSingle();
  if (error && /scope/.test(error.message)) {
    // Scope migration not applied yet: every token is a pre-scope token, so `full`.
    ({ data, error } = await supabase.from("health_app_tokens").select("id, user_profile_id").eq("token_hash", hash).maybeSingle());
    if (data) data = { ...data, scope: "full" };
  }
  if (error) throw new Error(`read token: ${error.message}`);
  const id = data ? String(data.user_profile_id) : null;
  // Anything but an explicit `full` is treated as the narrow scope.
  const scope: TokenScope = data?.scope === "full" ? "full" : "ingest";
  remember(tokenCache, hash, id, scope);
  if (data) {
    void supabase
      .from("health_app_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => undefined, () => undefined);
  }
  return id ? { id, scope } : null;
}

// ---------- request auth ----------

export type ResolveResult = { userProfileId: string; scope: TokenScope } | { error: "unauthorized" | "signup_closed" };

export async function resolveRequestUser(
  authorizationHeader: string | undefined,
  opts: { timezone?: string } = {},
): Promise<ResolveResult> {
  const legacy = authenticateHealthApp(authorizationHeader, healthAppAuthConfig());
  if (legacy) return { userProfileId: legacy, scope: "full" };

  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader?.trim() ?? "");
  const bearer = m?.[1]?.trim();
  if (!bearer) return { error: "unauthorized" };

  try {
    if (bearer.startsWith(PERSONAL_TOKEN_PREFIX)) {
      const t = await profileForPersonalToken(bearer);
      return t ? { userProfileId: t.id, scope: t.scope } : { error: "unauthorized" };
    }
    // Supabase access tokens are JWTs (three dot-separated parts).
    if (bearer.split(".").length !== 3) return { error: "unauthorized" };
    const key = sha256(bearer);
    const hit = cached(jwtCache, key);
    if (hit !== undefined) return hit ? { userProfileId: hit, scope: "full" } : { error: "unauthorized" };
    const user = await userFromSupabaseJwt(bearer);
    if (!user) {
      remember(jwtCache, key, null);
      return { error: "unauthorized" };
    }
    const id = await profileForAuthUser(user, opts.timezone);
    if (!id) return { error: "signup_closed" };
    remember(jwtCache, key, id);
    return { userProfileId: id, scope: "full" };
  } catch (err) {
    logger.error({ err: loggableError(err) }, "health app auth failed");
    return { error: "unauthorized" };
  }
}
