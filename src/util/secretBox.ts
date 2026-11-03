/**
 * Encrypts stored third-party keys (the Hevy key) with AES-256-GCM under `MAGNUS_SECRETS_KEY`
 * (32 bytes, base64 or hex). Stored form: `enc:v1:<iv>.<tag>.<ciphertext>` (base64url parts).
 * Without the env var values are stored as before, and plain values already in the table keep
 * reading fine, so turning encryption on needs no data migration: keys are encrypted the next
 * time they're saved, or by `npm run secrets:encrypt`.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

export function secretsKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.MAGNUS_SECRETS_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MAGNUS_SECRETS_KEY must be 32 bytes (64 hex characters or base64)");
  return key;
}

export const isSealed = (value: string): boolean => value.startsWith(PREFIX);

export function seal(plain: string, key: Buffer | null = secretsKey()): string {
  if (!key) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${[iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".")}`;
}

/** The plain value; null when it is sealed and can't be opened (no key, wrong key, tampered). */
export function open(stored: string, key: Buffer | null = secretsKey()): string | null {
  if (!isSealed(stored)) return stored;
  if (!key) return null;
  const [iv, tag, data] = stored.slice(PREFIX.length).split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
