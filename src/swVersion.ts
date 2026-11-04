/**
 * The service worker's cache name comes from the app shell's content, so every deploy that
 * changes a shell file gets a fresh cache on its own (no hand-bumped "v47" to forget), and a
 * deploy that changes nothing in the shell keeps the cache it has.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RequestHandler } from "express";

const CACHE_LINE = /const CACHE = "[^"]*";/;

/** The "/app/..." paths listed in sw.js's SHELL array. */
export function shellPaths(swSource: string): string[] {
  const m = swSource.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!m) return [];
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
}

/** A short hash over sw.js and every shell file it caches. Missing files hash as empty. */
export function shellVersion(appDir: string, swSource: string): string {
  const h = createHash("sha256").update(swSource);
  for (const p of shellPaths(swSource)) {
    const rel = p.replace(/^\/app\/?/, "") || "index.html";
    h.update(`\0${rel}\0`);
    try {
      h.update(readFileSync(path.join(appDir, rel)));
    } catch {
      /* a missing file just doesn't contribute */
    }
  }
  return h.digest("hex").slice(0, 12);
}

/** sw.js with its cache name replaced by the content version. */
export function versionedServiceWorker(appDir: string): string {
  const src = readFileSync(path.join(appDir, "sw.js"), "utf8");
  return src.replace(CACHE_LINE, `const CACHE = "magnus-health-${shellVersion(appDir, src)}";`);
}

/** Serves /app/sw.js, computed once per process (the files don't change while it runs). */
export function serviceWorkerHandler(appDir: string): RequestHandler {
  let body: string | null = null;
  return (_req, res, next) => {
    try {
      body ??= versionedServiceWorker(appDir);
    } catch {
      return next();
    }
    res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Service-Worker-Allowed", "/app/");
    res.send(body);
  };
}
