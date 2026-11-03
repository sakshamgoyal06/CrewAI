import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isSealed, open, seal, secretsKey } from "./secretBox.js";

describe("secretBox", () => {
  const key = randomBytes(32);

  it("round-trips and never stores the plain value", () => {
    const sealed = seal("hevy-key-123", key);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("hevy-key-123");
    expect(open(sealed, key)).toBe("hevy-key-123");
  });

  it("reads plain values written before encryption was on", () => {
    expect(open("plain-key", key)).toBe("plain-key");
    expect(open("plain-key", null)).toBe("plain-key");
  });

  it("stores plain when no key is configured", () => {
    expect(seal("x", null)).toBe("x");
  });

  it("returns null for a wrong key or tampering", () => {
    const sealed = seal("secret", key);
    expect(open(sealed, randomBytes(32))).toBeNull();
    expect(open(sealed, null)).toBeNull();
    expect(open(`${sealed.slice(0, -2)}AA`, key)).toBeNull();
  });

  it("accepts hex or base64 keys and rejects the wrong length", () => {
    expect(secretsKey({ MAGNUS_SECRETS_KEY: key.toString("hex") })?.equals(key)).toBe(true);
    expect(secretsKey({ MAGNUS_SECRETS_KEY: key.toString("base64") })?.equals(key)).toBe(true);
    expect(secretsKey({})).toBeNull();
    expect(() => secretsKey({ MAGNUS_SECRETS_KEY: "short" })).toThrow();
  });
});
