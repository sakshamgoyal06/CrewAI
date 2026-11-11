/**
 * Firebase Cloud Messaging for the native Android app (Magnus Beta). The app registers its FCM
 * token through POST /push/fcm; it is stored with the web push subscriptions as endpoint
 * `fcm:<token>` (the key columns hold "fcm"), so the scheduler, dedupe and receipts work unchanged.
 *
 * Sends use the HTTP v1 API with a service account (MAGNUS_FCM_SERVICE_ACCOUNT: the JSON key, raw
 * or base64). The message is data-only and high priority: the app draws the notification itself
 * and reports a receipt, as the service worker does.
 */
import { createSign } from "node:crypto";
import { z } from "zod";

export const FCM_PREFIX = "fcm:";

export const fcmTokenInput = z.object({ token: z.string().trim().min(20).max(4096) });

export type FcmConfig = { projectId: string; clientEmail: string; privateKey: string };

export function fcmConfig(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  const raw = env.MAGNUS_FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(text) as { project_id?: string; client_email?: string; private_key?: string };
    if (!j.project_id || !j.client_email || !j.private_key) return null;
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
  } catch {
    return null;
  }
}

export const isFcmEndpoint = (endpoint: string) => endpoint.startsWith(FCM_PREFIX);

/** A thrown send error carries `statusCode`, like web-push's, so sendNotification prunes dead tokens. */
export class FcmError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

type Fetch = typeof fetch;
let cached: { token: string; until: number } | null = null;

/** A Google OAuth access token for FCM, from a self-signed JWT; reused until 5 min before it expires. */
async function accessToken(cfg: FcmConfig, doFetch: Fetch, now = Date.now()): Promise<string> {
  if (cached && cached.until > now) return cached.token;
  const iat = Math.floor(now / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: cfg.clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(cfg.privateKey).toString("base64url");
  const res = await doFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new FcmError(`fcm auth ${res.status}`, 500);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: body.access_token, until: now + ((body.expires_in ?? 3600) - 300) * 1000 };
  return body.access_token;
}

/** Sends one data message to one app install. `payload` is the same JSON the service worker gets. */
export function fcmSender(cfg: FcmConfig, doFetch: Fetch = fetch) {
  return async (endpoint: string, payload: string): Promise<void> => {
    const token = endpoint.slice(FCM_PREFIX.length);
    const data = JSON.parse(payload) as Record<string, unknown>;
    const res = await doFetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken(cfg, doFetch)}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          // FCM data values must be strings.
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")])),
          android: { priority: "HIGH", ttl: "21600s" },
        },
      }),
    });
    if (res.ok) return;
    const text = await res.text().catch(() => "");
    // An uninstalled app or a refreshed token: gone for good, like web push's 404/410.
    const gone = res.status === 404 || text.includes("UNREGISTERED");
    throw new FcmError(`fcm send ${res.status}`, gone ? 410 : res.status);
  };
}

/** For tests: forget the cached access token. */
export function resetFcmAuthCache(): void {
  cached = null;
}
