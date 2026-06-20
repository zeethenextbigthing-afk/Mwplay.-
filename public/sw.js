// MW Play — minimal service worker
// Purpose: (1) satisfy the "installable app" requirement browsers check for,
// (2) cache the app shell so the app still opens (offline-ish) without a network blip.
// This intentionally does NOT cache audio/cover URLs or API calls — only the static shell.

const CACHE_NAME = "mwplay-shell-v1";
const SHELL_FILES = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_FILES).catch(() => {
        // Don't fail install if one shell file 404s (e.g. different build output names)
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests for the app shell.
  // Everything else (Supabase API/storage, audio, images) goes straight to network.
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Opportunistically cache successful navigations/static assets
          if (response.ok && (request.mode === "navigate" || request.destination === "")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match("/"));
    })
  );
});
