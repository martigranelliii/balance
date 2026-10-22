/* Balance offline shell. Financial data is loaded from the authenticated account. */
const CACHE_NAME = "balance-shell-v2";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // A missing optional shell file must not block installation.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("balance-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "CACHE_URLS" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        data.urls
          .filter((url) => typeof url === "string" && url.startsWith(self.location.origin))
          .map(async (url) => {
            try {
              const existing = await cache.match(url);
              if (existing) return;
              const response = await fetch(url);
              if (response.ok) await cache.put(url, response);
            } catch {
              // Offline caching is best effort.
            }
          }),
      );
    })(),
  );
});

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      cache.put("/", copy).catch(() => {});
    }
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      new Response(
        `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Balance</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f4ec;color:#132638;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:24px}p{color:#4b6279}</style></head><body><main><h1 style="font-family:Georgia,serif">balance.</h1><p>Sei offline e il tuo account non è raggiungibile. Torna online e riapri Balance.</p></main></body></html>`,
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    ["script", "style", "font", "image", "manifest"].includes(request.destination);

  if (isStaticAsset) {
    event.respondWith(cacheFirst(request));
  }
});
