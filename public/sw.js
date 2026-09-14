const cacheName = "powerwashing-pros-shell-v2";
const appShell = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appShell)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(cacheName).then((cache) => cache.put("/", response.clone()));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  if (["script", "style", "image", "font", "manifest"].includes(request.destination)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        if (response.ok) caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
        return response;
      })),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() ?? "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "The Powerwashing Pros", {
    body: data.body || "You have a new update.",
    icon: "/pwa-icon-192.png",
    badge: "/pwa-icon-192.png",
    tag: data.tag || "powerwashing-pros",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  }));
});
