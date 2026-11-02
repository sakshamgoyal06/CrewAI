// Debug telemetry: page loads, taps, API timings, JS errors and main-thread hangs, batched to
// /api/health/events and stored in Supabase (health_app_events) so issues can be traced later.
// Cheap by design: events sit in memory and go out in one request every 15s or when the app is
// hidden. Never records typed text, chat content or the token.

export const APP_VERSION = "v7";
import { currentBearer } from "./session.js";

const ENDPOINT = "/api/health/events";
const FLUSH_MS = 15_000;
const BATCH = 40;
const MAX_BUFFER = 300;

export const SESSION_ID = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).slice(0, 64);

let buffer = [];
let timer = null;

const token = currentBearer;

/** Queue one event. `extra` may carry durationMs and status. */
export function track(kind, name, props, extra = {}) {
  try {
    buffer.push({ kind, name: name == null ? null : String(name).slice(0, 200), props: props || undefined, at: Date.now(), ...extra });
    if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);
    if (buffer.length >= BATCH) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_MS);
  } catch { /* telemetry never breaks the app */ }
}

export function flush() {
  clearTimeout(timer);
  timer = null;
  const t = token();
  if (!buffer.length || !t || !navigator.onLine) return;
  while (buffer.length) {
    const events = buffer.splice(0, BATCH);
    fetch(ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
      body: JSON.stringify({ sessionId: SESSION_ID, appVersion: APP_VERSION, events }),
    }).catch(() => {});
  }
}

/** `/meals/3f2a…` and `/rca/12` become `/meals/:id`, so timings group by endpoint. */
export function normalizePath(path) {
  const [p, q] = String(path).split("?");
  const clean = p.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id").replace(/\/\d+(?=\/|$)/g, "/:id");
  if (!q) return clean;
  const keys = [...new URLSearchParams(q).keys()].join(",");
  return keys ? `${clean}?${keys}` : clean;
}

/** Called by api() for every request. */
export function trackApi(path, method, status, durationMs, error) {
  track("api", normalizePath(path), { method: method || "GET", ...(error ? { error: String(error).slice(0, 300) } : {}), ...(durationMs > 3000 ? { slow: true } : {}) }, { durationMs, status });
}

function label(node) {
  const d = node.dataset || {};
  return node.id || (d.view && `tab:${d.view}`) || (d.sheet && `sheet:${d.sheet}`) || node.getAttribute("aria-label") || (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) || node.tagName.toLowerCase();
}

// FCP can land after the load event on a cached start, so watch for it instead of reading once.
let fcpEntry = null;
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.name === "first-contentful-paint") fcpEntry = e;
  }).observe({ type: "paint", buffered: true });
} catch { /* unsupported */ }

function install() {
  // Taps on anything clickable. Inputs are not recorded.
  document.addEventListener("click", (e) => {
    const node = e.target?.closest?.("button, a, [data-sheet], [data-view], [role=button], .chip");
    if (node) track("tap", label(node), { view: document.querySelector(".tab.active")?.dataset.view });
  }, { capture: true, passive: true });

  window.addEventListener("error", (e) => {
    track("error", e.message || "error", { source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack?.slice(0, 1500) });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    track("error", (r && r.message) || String(r).slice(0, 200), { type: "unhandledrejection", stack: r?.stack?.slice(0, 1500) });
  });

  window.addEventListener("load", () => setTimeout(() => {
    const n = performance.getEntriesByType?.("navigation")?.[0];
    const paint = performance.getEntriesByName?.("first-contentful-paint")?.[0] || fcpEntry;
    track("page_load", location.pathname + location.hash, n ? {
      type: n.type,
      ttfbMs: Math.round(n.responseStart),
      domContentLoadedMs: Math.round(n.domContentLoadedEventEnd),
      fcpMs: paint ? Math.round(paint.startTime) : null,
      transferBytes: n.transferSize,
      swControlled: !!navigator.serviceWorker?.controller,
      online: navigator.onLine,
      standalone: matchMedia("(display-mode: standalone)").matches,
      screen: `${innerWidth}x${innerHeight}`,
    } : {}, { durationMs: n ? Math.round(n.loadEventEnd || performance.now()) : Math.round(performance.now()) });
  }, 1000)); // after first paint, which can come later than load on a cached start

  // Main-thread hangs and laggy taps (Chrome on Android supports both).
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.duration >= 200) track("hang", "longtask", { startMs: Math.round(e.startTime) }, { durationMs: Math.round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration >= 300) track("vitals", "slow_interaction", { event: e.name, target: e.target ? label(e.target) : null, delayMs: Math.round(e.processingStart - e.startTime) }, { durationMs: Math.round(e.duration) });
      }
    }).observe({ type: "event", durationThreshold: 300, buffered: true });
  } catch { /* unsupported */ }

  document.addEventListener("visibilitychange", () => {
    track("lifecycle", document.hidden ? "hidden" : "visible");
    if (document.hidden) flush();
  });
  window.addEventListener("pagehide", flush);
  window.addEventListener("online", () => { track("lifecycle", "online"); flush(); });
  window.addEventListener("offline", () => track("lifecycle", "offline"));
}

install();
window.magnusTrack = track;
