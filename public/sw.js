// Only public fallback assets are cached. Accounts and APIs always use the network.
const CACHE = "nutribot-offline-v2";
const OFFLINE = "/offline.html";
const PUBLIC_FILES = [OFFLINE, "/pwa/icon-192.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_FILES))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith("nutribot-offline-") && key !== CACHE)
    .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin
      || url.pathname === "/api" || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      if (response.status >= 500) throw new Error("Servidor no disponible");
      return response;
    }).catch(async () => (await (await caches.open(CACHE)).match(OFFLINE))
      || new Response("No se pudo conectar con Nutribot. Vuelve a intentarlo.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
      })));
  } else if (PUBLIC_FILES.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async (cache) =>
      (await cache.match(url.pathname)) || fetch(request)));
  }
});
