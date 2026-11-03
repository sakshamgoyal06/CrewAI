/**
 * Security headers. The app keeps its sign-in in localStorage, so a strict Content-Security-Policy
 * on /app is what keeps an injected script from reading it. Inline scripts are allowed by hash,
 * computed from the served index.html at startup so editing that script can't silently break it.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type express from "express";

/** sha256 CSP sources for every inline <script> (no src) in an HTML file. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    out.push(`'sha256-${createHash("sha256").update(m[1] ?? "").digest("base64")}'`);
  }
  return out;
}

export function appCsp(scriptHashes: string[], supabaseUrl?: string): string {
  const supabase = supabaseUrl ? new URL(supabaseUrl).origin : "https://*.supabase.co";
  return [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.join(" ")} https://checkout.razorpay.com`.replace(/\s+/g, " "),
    // Inline style attributes are set from JS; no inline <style> needs more than this.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${supabase} https://*.razorpay.com`,
    "frame-src https://*.razorpay.com",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Headers for every response; the CSP only on the app's pages. */
export function securityHeaders(appDir: string, env: NodeJS.ProcessEnv = process.env): express.RequestHandler {
  let hashes: string[] = [];
  try {
    hashes = inlineScriptHashes(readFileSync(path.join(appDir, "index.html"), "utf8"));
  } catch {
    // No app directory (tests, API-only): the CSP still blocks every inline script.
  }
  const csp = appCsp(hashes, env.SUPABASE_URL?.trim() || undefined);
  const production = env.NODE_ENV === "production";
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(self), camera=(self)");
    if (production) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (req.path === "/app" || req.path.startsWith("/app/")) res.setHeader("Content-Security-Policy", csp);
    next();
  };
}
