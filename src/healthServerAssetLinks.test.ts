import { describe, expect, it, vi } from "vitest";

vi.mock("./tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import { assetLinks } from "./healthServer.js";

const FP = Array.from({ length: 32 }, () => "ab").join(":");

describe("assetLinks", () => {
  it("is empty until a fingerprint is configured", () => {
    expect(assetLinks({})).toEqual([]);
    expect(assetLinks({ MAGNUS_ANDROID_CERT_SHA256: "not-a-fingerprint" })).toEqual([]);
  });

  it("lists valid fingerprints for the app package", () => {
    const [stmt] = assetLinks({ MAGNUS_ANDROID_CERT_SHA256: ` ${FP} , junk` }) as Array<{ target: Record<string, unknown> }>;
    expect(stmt!.target).toEqual({
      namespace: "android_app",
      package_name: "app.magnus.health",
      sha256_cert_fingerprints: [FP.toUpperCase()],
    });
  });
});
