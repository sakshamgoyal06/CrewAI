import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A tiny in-memory stand-in for the few supabase-js chains accounts.ts uses. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const users = new Map<string, { id: string; email: string; user_metadata: Row }>();

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  let patch: Row = {};
  let inserted: Row | null = null;
  const rows = () => (tables[table] ??= []);
  const run = (): Row[] => {
    if (op === "insert" && inserted) {
      if (rows().some((r) => inserted!.auth_user_id && r.auth_user_id === inserted!.auth_user_id)) {
        throw Object.assign(new Error("duplicate"), { dup: true });
      }
      const row = { id: `p-${rows().length + 1}`, ...inserted };
      rows().push(row);
      return [row];
    }
    const hit = rows().filter((r) => filters.every((f) => f(r)));
    if (op === "update") for (const r of hit) Object.assign(r, patch);
    if (op === "delete") tables[table] = rows().filter((r) => !hit.includes(r));
    return hit;
  };
  const settle = (single: boolean) => {
    try {
      const out = run();
      return Promise.resolve({ data: single ? (out[0] ?? null) : out, error: null });
    } catch (e) {
      return Promise.resolve({ data: null, error: { message: (e as Error).message } });
    }
  };
  const chain = {
    select: () => chain,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), chain),
    order: () => chain,
    update: (p: Row) => ((op = "update"), (patch = p), chain),
    insert: (r: Row) => ((op = "insert"), (inserted = r), chain),
    delete: () => ((op = "delete"), chain),
    upsert: () => Promise.resolve({ error: null }),
    maybeSingle: () => settle(true),
    single: () => settle(true),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => settle(false).then(ok, bad),
  };
  return chain;
}

vi.mock("../tools/clients.js", () => ({
  supabase: {
    from: (t: string) => query(t),
    auth: {
      getUser: async (jwt: string) => {
        const u = users.get(jwt);
        return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: "bad jwt" } };
      },
    },
  },
  anthropic: {},
}));

import {
  createPersonalToken,
  isOwnerEmail,
  isOwnerProfileRow,
  publicAuthConfig,
  resolveRequestUser,
  scopeAllows,
  signupAllowed,
  validTimezone,
} from "./accounts.js";

const OWNER = "owner-profile";
const LEGACY = "l".repeat(40);
const jwt = (name: string) => `${name}.payload.sig`;

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  users.clear();
  tables.user_profile = [{ id: OWNER, auth_user_id: null }];
  vi.stubEnv("MAGNUS_HEALTH_APP_TOKEN", LEGACY);
  vi.stubEnv("MAGNUS_HEALTH_APP_USER_PROFILE_ID", OWNER);
  vi.stubEnv("MAGNUS_OWNER_EMAIL", "owner@example.com");
  vi.stubEnv("MAGNUS_SIGNUP_MODE", "open");
});

afterEach(() => vi.unstubAllEnvs());

describe("sign-up rules", () => {
  it("is invite-only by default (fails closed) and open only when asked", () => {
    expect(signupAllowed("a@b.com", {})).toBe(false);
    expect(signupAllowed("a@b.com", { MAGNUS_SIGNUP_MODE: "open" })).toBe(true);
    expect(signupAllowed("Owner@Example.com", { MAGNUS_OWNER_EMAIL: "owner@example.com" })).toBe(true);
    const env = { MAGNUS_SIGNUP_MODE: "invite", MAGNUS_INVITE_EMAILS: "Friend@x.com, other@y.com" };
    expect(signupAllowed("friend@x.com", env)).toBe(true);
    expect(signupAllowed("stranger@x.com", env)).toBe(false);
    expect(signupAllowed(null, env)).toBe(false);
  });

  it("matches the owner email case-insensitively", () => {
    expect(isOwnerEmail("Owner@Example.com", { MAGNUS_OWNER_EMAIL: "owner@example.com" })).toBe(true);
    expect(isOwnerEmail("owner@example.com", {})).toBe(false);
  });

  it("only offers Google when the publishable key is configured", () => {
    expect(publicAuthConfig({ SUPABASE_URL: "https://x.supabase.co" }).google).toBe(false);
    expect(publicAuthConfig({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1" })).toEqual({
      supabaseUrl: "https://x.supabase.co",
      supabaseKey: "sb_publishable_1",
      google: true,
    });
  });

  it("accepts only real IANA timezones", () => {
    expect(validTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(validTimezone("Not/AZone")).toBeNull();
  });
});

describe("resolveRequestUser", () => {
  it("keeps the legacy owner token working", async () => {
    expect(await resolveRequestUser(`Bearer ${LEGACY}`)).toEqual({ userProfileId: OWNER, scope: "full" });
  });

  it("rejects missing and unknown bearers", async () => {
    expect(await resolveRequestUser(undefined)).toEqual({ error: "unauthorized" });
    expect(await resolveRequestUser("Bearer nope")).toEqual({ error: "unauthorized" });
    expect(await resolveRequestUser(`Bearer ${jwt("unknown")}`)).toEqual({ error: "unauthorized" });
  });

  it("links the owner's Google account to the existing owner profile", async () => {
    users.set(jwt("owner"), { id: "auth-owner", email: "owner@example.com", user_metadata: {} });
    expect(await resolveRequestUser(`Bearer ${jwt("owner")}`)).toEqual({ userProfileId: OWNER, scope: "full" });
    expect(tables.user_profile![0]!.auth_user_id).toBe("auth-owner");
  });

  it("creates a fresh profile for a new Google user, once", async () => {
    users.set(jwt("new"), { id: "auth-new", email: "new@example.com", user_metadata: { full_name: "New Person" } });
    const first = await resolveRequestUser(`Bearer ${jwt("new")}`, { timezone: "Europe/London" });
    expect(first).toEqual({ userProfileId: "p-2", scope: "full" });
    expect(tables.user_profile![1]).toMatchObject({ auth_user_id: "auth-new", display_name: "New Person", timezone: "Europe/London" });
    // A second token for the same account maps to the same profile.
    users.set(jwt("new2"), { id: "auth-new", email: "new@example.com", user_metadata: {} });
    expect(await resolveRequestUser(`Bearer ${jwt("new2")}`)).toEqual({ userProfileId: "p-2", scope: "full" });
    expect(tables.user_profile).toHaveLength(2);
  });

  it("turns strangers away when sign-up is invite-only, or unset", async () => {
    vi.stubEnv("MAGNUS_SIGNUP_MODE", "");
    users.set(jwt("stranger"), { id: "auth-s", email: "s@example.com", user_metadata: {} });
    expect(await resolveRequestUser(`Bearer ${jwt("stranger")}`)).toEqual({ error: "signup_closed" });
  });

  it("accepts a personal token only by its hash", async () => {
    const token = await createPersonalToken(OWNER);
    expect(token.startsWith("mgt_")).toBe(true);
    const stored = tables.health_app_tokens![0]!;
    expect(stored.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(await resolveRequestUser(`Bearer ${token}`)).toEqual({ userProfileId: OWNER, scope: "ingest" });
    expect(await resolveRequestUser("Bearer mgt_wrong")).toEqual({ error: "unauthorized" });
  });

  it("keeps tokens made before scopes existed at full access", async () => {
    const token = "mgt_legacy-token-made-before-scopes";
    (tables.health_app_tokens ??= []).push({ id: "t-old", user_profile_id: OWNER, token_hash: createHash("sha256").update(token).digest("hex"), scope: "full" });
    expect(await resolveRequestUser(`Bearer ${token}`)).toEqual({ userProfileId: OWNER, scope: "full" });
  });
});

describe("scopeAllows", () => {
  it("lets device tokens only send data in and ask whose account it is", () => {
    expect(scopeAllows("ingest", "POST", "/ingest/health-connect")).toBe(true);
    expect(scopeAllows("ingest", "POST", "/steps")).toBe(true);
    expect(scopeAllows("ingest", "GET", "/whoami")).toBe(true);
    expect(scopeAllows("ingest", "GET", "/account/export")).toBe(false);
    expect(scopeAllows("ingest", "DELETE", "/account")).toBe(false);
    expect(scopeAllows("ingest", "GET", "/chat")).toBe(false);
    expect(scopeAllows("ingest", "POST", "/account/tokens")).toBe(false);
    expect(scopeAllows("full", "DELETE", "/account")).toBe(true);
  });
});

describe("isOwnerProfileRow", () => {
  it("finds the owner by Google email, so a fresh account is still the owner", () => {
    const env = { MAGNUS_OWNER_EMAIL: "Owner@Example.com" };
    expect(isOwnerProfileRow("any-new-id", "owner@example.com", env)).toBe(true);
    expect(isOwnerProfileRow("any-new-id", "someone@example.com", env)).toBe(false);
    expect(isOwnerProfileRow("any-new-id", null, env)).toBe(false);
  });

  it("still honours the legacy owner profile id when it is set", () => {
    expect(isOwnerProfileRow("p1", null, { MAGNUS_HEALTH_APP_USER_PROFILE_ID: "p1" })).toBe(true);
    expect(isOwnerProfileRow("p2", null, { MAGNUS_HEALTH_APP_USER_PROFILE_ID: "p1" })).toBe(false);
    expect(isOwnerProfileRow("p1", null, {})).toBe(false);
  });
});
