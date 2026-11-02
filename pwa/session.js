// Who this device is signed in as. Two kinds of session:
//   - Google sign-in through Supabase Auth: a short-lived access token plus a refresh token.
//   - A pasted app token (the original owner token, or a personal token): never expires.
// The API takes either as `Authorization: Bearer …`.

const AUTH_KEY = "magnus-auth";
const LEGACY_TOKEN_KEY = "magnus-health-token";
const CONFIG_KEY = "magnus-auth-config";
const REFRESH_EARLY_MS = 60_000;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function write(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

export function session() {
  const s = read(AUTH_KEY);
  if (s && (s.kind === "google" || s.kind === "token")) return s;
  // Installs from before sign-in existed kept the token under its old key.
  const legacy = read(LEGACY_TOKEN_KEY);
  return typeof legacy === "string" && legacy ? { kind: "token", token: legacy } : null;
}

export const signedIn = () => !!session();

export function useToken(token) {
  write(AUTH_KEY, { kind: "token", token: token.trim() });
  write(LEGACY_TOKEN_KEY, null);
}

export function signOut() {
  const s = session();
  write(AUTH_KEY, null);
  write(LEGACY_TOKEN_KEY, null);
  const cfg = read(CONFIG_KEY);
  if (s?.kind === "google" && cfg?.supabaseUrl) {
    fetch(`${cfg.supabaseUrl}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: cfg.supabaseKey, authorization: `Bearer ${s.accessToken}` },
    }).catch(() => {});
  }
}

/** The bearer as it stands, without refreshing (telemetry; a stale one just fails quietly). */
export function currentBearer() {
  const s = session();
  return s ? (s.kind === "google" ? s.accessToken : s.token) : "";
}

export async function authConfig() {
  try {
    const res = await fetch("/api/health/config");
    const body = await res.json();
    if (body?.auth) write(CONFIG_KEY, body.auth);
    return body?.auth ?? read(CONFIG_KEY);
  } catch {
    return read(CONFIG_KEY);
  }
}

/** Sends the browser to Google (through Supabase); it comes back to /app/ with tokens in the hash. */
export async function signInWithGoogle() {
  const cfg = await authConfig();
  if (!cfg?.google) throw new Error("Google sign-in isn't set up on this server yet.");
  const back = `${location.origin}/app/`;
  location.assign(`${cfg.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`);
}

/**
 * Called on load. If Supabase just sent us back with `#access_token=…`, keep the session and clean
 * the URL. Returns an error message when the hash carries one.
 */
export function captureRedirect() {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!hash.includes("access_token=") && !hash.includes("error=")) return null;
  const p = new URLSearchParams(hash);
  history.replaceState(null, "", `${location.pathname}#coach`);
  if (p.get("error")) return p.get("error_description") || "Sign-in was cancelled.";
  const accessToken = p.get("access_token");
  const refreshToken = p.get("refresh_token");
  const expiresIn = Number(p.get("expires_in") || 3600);
  if (!accessToken || !refreshToken) return "Sign-in didn't finish. Try again.";
  write(AUTH_KEY, { kind: "google", accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000 });
  write(LEGACY_TOKEN_KEY, null);
  return null;
}

let refreshing = null;

async function refresh(s) {
  const cfg = read(CONFIG_KEY) ?? (await authConfig());
  if (!cfg?.supabaseUrl) return null;
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: cfg.supabaseKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refreshToken }),
  });
  if (!res.ok) {
    // A refresh token that was revoked or already used: the person has to sign in again.
    if (res.status === 400 || res.status === 401) return "expired";
    return null;
  }
  const body = await res.json();
  const next = {
    kind: "google",
    accessToken: body.access_token,
    refreshToken: body.refresh_token || s.refreshToken,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
  write(AUTH_KEY, next);
  return next;
}

/** The bearer for the next request, refreshing the Google session first when it's about to expire. */
export async function bearer({ force = false } = {}) {
  const s = session();
  if (!s) return "";
  if (s.kind === "token") return s.token;
  if (!force && s.expiresAt - Date.now() > REFRESH_EARLY_MS) return s.accessToken;
  refreshing ??= refresh(s).finally(() => { refreshing = null; });
  const next = await refreshing.catch(() => null);
  if (next === "expired") return "";
  return next ? next.accessToken : s.accessToken;
}
