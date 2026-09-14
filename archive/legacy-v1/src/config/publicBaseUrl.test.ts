import { describe, expect, it } from "vitest";

import {
  httpsOrigin,
  resolvePublicBaseUrl,
  youtubeOauthRedirectUri,
} from "./publicBaseUrl.js";

describe("httpsOrigin", () => {
  it("keeps only scheme + host (+ port)", () => {
    expect(httpsOrigin("https://magnus.up.railway.app/telegram/abc")).toBe(
      "https://magnus.up.railway.app",
    );
    expect(httpsOrigin("https://magnus.up.railway.app/")).toBe("https://magnus.up.railway.app");
  });

  it("rejects non-https", () => {
    expect(httpsOrigin("http://magnus.up.railway.app")).toBeNull();
  });
});

describe("youtubeOauthRedirectUri", () => {
  it("builds the Railway callback URI", () => {
    expect(
      youtubeOauthRedirectUri({ RAILWAY_PUBLIC_DOMAIN: "crewai-production-c221.up.railway.app" }),
    ).toBe("https://crewai-production-c221.up.railway.app/oauth/youtube/callback");
  });

  it("strips paths from TELEGRAM_WEBHOOK_URL so OAuth stays at /oauth/youtube/callback", () => {
    expect(
      youtubeOauthRedirectUri({
        TELEGRAM_WEBHOOK_URL: "https://crewai-production-c221.up.railway.app/telegram/deadbeef",
      }),
    ).toBe("https://crewai-production-c221.up.railway.app/oauth/youtube/callback");
  });

  it("prefers MAGNUS_PUBLIC_BASE_URL", () => {
    expect(
      resolvePublicBaseUrl({
        MAGNUS_PUBLIC_BASE_URL: "https://custom.example.com/",
        RAILWAY_PUBLIC_DOMAIN: "ignored.up.railway.app",
      }),
    ).toEqual({ base: "https://custom.example.com", source: "MAGNUS_PUBLIC_BASE_URL" });
  });
});

describe("googleOauthRedirectUri", () => {
  it("builds the unified Google callback URI", async () => {
    const { googleOauthRedirectUri } = await import("./publicBaseUrl.js");
    expect(
      googleOauthRedirectUri({ RAILWAY_PUBLIC_DOMAIN: "crewai-production-c221.up.railway.app" }),
    ).toBe("https://crewai-production-c221.up.railway.app/oauth/google/callback");
  });
});
