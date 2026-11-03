import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { appCsp, inlineScriptHashes } from "./securityHeaders.js";

describe("security headers", () => {
  it("hashes inline scripts and skips external ones", () => {
    const hashes = inlineScriptHashes('<script>a()</script><script src="x.js"></script><script type="module">b()</script>');
    expect(hashes).toHaveLength(2);
    expect(hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/=]+'$/);
  });

  it("covers the app's own inline theme script", () => {
    const html = readFileSync("pwa/index.html", "utf8");
    expect(inlineScriptHashes(html).length).toBeGreaterThan(0);
  });

  it("allows the app's outside services and nothing inline beyond the hashes", () => {
    const csp = appCsp(["'sha256-abc'"], "https://uktsxijrewbqjcjnrfdv.supabase.co");
    expect(csp).toContain("script-src 'self' 'sha256-abc' https://checkout.razorpay.com");
    expect(csp).toContain("connect-src 'self' https://uktsxijrewbqjcjnrfdv.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });
});
