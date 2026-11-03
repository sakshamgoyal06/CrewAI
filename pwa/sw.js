// App shell: served from cache at once, refreshed in the background (a new deploy shows on the
// next open). API calls always go to the network so numbers are never stale.
const CACHE = "magnus-health-v15";
const SHELL = ["/app/", "/app/index.html", "/app/styles.css", "/app/app.js", "/app/telemetry.js", "/app/session.js", "/app/onboarding.js", "/app/scan.js", "/app/foodprefs.js", "/app/routine.js", "/app/manifest.webmanifest", "/app/icon.svg"];

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
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/app/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => w.url.startsWith(`${self.location.origin}/app/`));
      if (open) {
        open.navigate(target).catch(() => {});
        return open.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
