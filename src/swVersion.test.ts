import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shellPaths, versionedServiceWorker } from "./swVersion.js";

const SW = `const CACHE = "magnus-health-v1";\nconst SHELL = ["/app/", "/app/app.js", "/app/styles.css"];\n`;

function appDir(appJs: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "sw-"));
  writeFileSync(path.join(dir, "sw.js"), SW);
  writeFileSync(path.join(dir, "index.html"), "<html></html>");
  writeFileSync(path.join(dir, "app.js"), appJs);
  writeFileSync(path.join(dir, "styles.css"), "body{}");
  return dir;
}

describe("service worker version", () => {
  it("reads the shell list", () => {
    expect(shellPaths(SW)).toEqual(["/app/", "/app/app.js", "/app/styles.css"]);
  });
  it("replaces the cache name with a content hash", () => {
    const out = versionedServiceWorker(appDir("let a = 1;"));
    expect(out).toMatch(/^const CACHE = "magnus-health-[0-9a-f]{12}";/);
    expect(out).toContain("const SHELL = [");
  });
  it("changes when a shell file changes, and only then", () => {
    const a = versionedServiceWorker(appDir("let a = 1;"));
    const same = versionedServiceWorker(appDir("let a = 1;"));
    const changed = versionedServiceWorker(appDir("let a = 2;"));
    expect(same).toBe(a);
    expect(changed).not.toBe(a);
  });
  it("works on the real app shell", () => {
    expect(versionedServiceWorker(path.resolve("pwa"))).toMatch(/const CACHE = "magnus-health-[0-9a-f]{12}";/);
  });
});
