import { describe, expect, it, vi } from "vitest";

vi.mock("./tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { assetLinks, BUILT_APK_CERT_SHA256 } from "./healthServer.js";

const FP = Array.from({ length: 32 }, () => "ab").join(":");

describe("assetLinks", () => {
  const fps = (env: NodeJS.ProcessEnv) =>
    (assetLinks(env) as Array<{ target: { sha256_cert_fingerprints: string[] } }>)[0]?.target.sha256_cert_fingerprints;

  it("vouches for the release APK out of the box", () => {
    expect(fps({})).toEqual([BUILT_APK_CERT_SHA256]);
    expect(fps({ MAGNUS_ANDROID_CERT_SHA256: "not-a-fingerprint" })).toEqual([BUILT_APK_CERT_SHA256]);
  });

  it("never vouches for the public debug key", () => {
    expect(fps({})).not.toContain("8E:67:88:10:B2:47:88:B6:F5:97:DD:93:6B:AD:00:FB:C5:5D:8B:25:B7:FF:39:D2:6A:08:A0:94:67:37:8C:D2");
  });

  it("can turn the built-in cert off", () => {
    expect(assetLinks({ MAGNUS_ANDROID_CERT_SHA256: "none" })).toEqual([]);
  });

  it("lists valid fingerprints for the app package", () => {
    const [stmt] = assetLinks({ MAGNUS_ANDROID_CERT_SHA256: ` ${FP} , junk` }) as Array<{ target: Record<string, unknown> }>;
    expect(stmt!.target).toEqual({
      namespace: "android_app",
      package_name: "app.magnus.health",
      sha256_cert_fingerprints: [BUILT_APK_CERT_SHA256, FP.toUpperCase()],
    });
  });
});
