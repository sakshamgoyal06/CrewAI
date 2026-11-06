// App shell: served from cache at once, refreshed in the background (a new deploy shows on the
// next open). API calls always go to the network so numbers are never stale.
// The server swaps this name for a hash of the shell files on every deploy (src/swVersion.ts),
// so there's no need to bump it by hand; the literal only applies when served as a plain file.
const CACHE = "magnus-health-v55";
const SHELL = ["/app/", "/app/index.html", "/app/styles.css", "/app/app.js", "/app/telemetry.js", "/app/session.js", "/app/onboarding.js", "/app/scan.js", "/app/foodprefs.js", "/app/routine.js", "/app/meals.js", "/app/mealbuilder.js", "/app/dayTone.js", "/app/manifest.webmanifest", "/app/icon.svg", "/app/privacy.html", "/app/fonts/lato-latin-300-normal.woff2", "/app/fonts/lato-latin-400-normal.woff2", "/app/fonts/lato-latin-700-normal.woff2", "/app/fonts/lato-latin-900-normal.woff2"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }
  const network = fetch(event.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(event.request, copy));
    }
    return res;
  });
  event.waitUntil(network.catch(() => undefined));
  event.respondWith(
    caches.match(event.request).then(
      (hit) => hit || network.catch(() => caches.match("/app/index.html")),
    ),
  );
});

// Push notifications from the proactive scheduler.
// Tells the server the push arrived and whether it could be shown, so a missing notification
// can be traced to the phone or the server. Never blocks or breaks the notification itself.
function receipt(id, shown, error) {
  if (!id) return Promise.resolve();
  return fetch("/api/health/push/receipt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, shown, error: error ? String(error).slice(0, 300) : undefined }),
  }).catch(() => {});
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Magnus", {
      body: data.body || "",
      icon: "/app/icon.svg",
      badge: "/app/icon.svg",
      tag: data.tag || "magnus",
      renotify: true,
      data: { url: data.url || "/app/" },
    }).then(
      () => Promise.all([
        receipt(data.id, true),
        // An open app refreshes its chat now instead of waiting for its next check.
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
          for (const w of wins) w.postMessage({ type: "push" });
        }),
      ]),
      (err) => receipt(data.id, false, err && (err.message || err)),
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(`${self.location.origin}/app/`));
      if (open) {
        // Same page: switch tabs in place (no reload, no lost scroll); another page: go there.
        const samePage = new URL(open.url).pathname === new URL(target).pathname;
        if (samePage) open.postMessage({ type: "open", url: target });
        else open.navigate(target).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
