/*
 * Balance service worker.
 *
 * Update-safe policy:
 * - navigations/documents are network-first with `cache: "no-store"`, so a new
 *   deployment is always picked up when the device is online; the last good
 *   HTML is kept only as an offline fallback;
 * - versioned build assets (`/_next/static/*`, icons) stay cache-first;
 * - API/auth requests are never intercepted or cached;
 * - activating a new worker deletes obsolete Balance caches and reloads open
 *   windows so an installed iOS PWA does not keep running old code.
 */

const VERSION = "3";
const SHELL_CACHE = `balance-shell-${VERSION}`;
const ASSET_CACHE = `balance-assets-${VERSION}`;
const DOCUMENT_CACHE = `balance-documents-${VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, ASSET_CACHE, DOCUMENT_CACHE]);

const DOCUMENT_KEY = "/";
const MAX_WARM_ASSETS = 200;

const SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

const OFFLINE_HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Balance</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f4ec;color:#132638;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;padding:24px}p{color:#4b6279}</style></head><body><main><h1 style="font-family:Georgia,serif">balance.</h1><p>Sei offline e il tuo account non è raggiungibile. Torna online e riapri Balance.</p></main></body></html>`;

let firstInstall = false;

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isBypassed(url) {
  return (
    url.pathname === "/sw.js" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  );
}

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      firstInstall = !keys.some((key) => key.startsWith("balance-"));

      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: "reload" }));
            if (response.ok) await cache.put(url, response);
          } catch {
            // Optional shell files must not block installation.
          }
        }),
      );

      // Activate immediately: an installed PWA must not wait for a reinstall
      // or for every window to be closed before it receives a new version.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Only Balance caches are touched. User data (localStorage, IndexedDB,
      // Supabase session) is never part of the Cache Storage namespace.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith("balance-") && !CURRENT_CACHES.has(key),
          )
          .map((key) => caches.delete(key)),
      );

      await self.clients.claim();

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        try {
          client.postMessage({ type: "BALANCE_SW_ACTIVATED", version: VERSION });
        } catch {
          // A client may disappear while activating.
        }
      }

      if (firstInstall) return;

      // The page that requested this update may still be running the previous
      // bundle (iOS keeps inactive PWAs suspended for a long time). A forced
      // navigation makes the new worker and the new HTML effective without
      // asking the user to reinstall anything. This happens once per worker
      // version, so it cannot cause a reload loop.
      await Promise.all(
        windows.map(async (client) => {
          try {
            await client.navigate(client.url);
          } catch {
            // Navigation is best effort; the page reloads on its own at the
            // next launch or visibility change.
          }
        }),
      );
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(warmAssets(data.urls));
  }
});

async function warmAssets(urls) {
  let cache;
  try {
    cache = await caches.open(ASSET_CACHE);
  } catch {
    return;
  }

  const seen = new Set();
  for (const raw of urls.slice(0, MAX_WARM_ASSETS)) {
    if (typeof raw !== "string" || seen.has(raw)) continue;
    seen.add(raw);

    let url;
    try {
      url = new URL(raw, self.location.origin);
    } catch {
      continue;
    }
    if (!isSameOrigin(url) || !isCacheableAsset(url)) continue;

    try {
      const existing = await cache.match(url.toString());
      if (existing) continue;
      const response = await fetch(url.toString());
      if (response.ok) await cache.put(url.toString(), response);
    } catch {
      // Offline warm-up is best effort.
    }
  }
}

async function networkFirstDocument(request) {
  try {
    // Bypass the HTTP cache completely: `max-age=0` is not always honoured by
    // iOS when a standalone PWA is resumed.
    const response = await fetch(request, { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";

    if (
      response.ok &&
      contentType.includes("text/html") &&
      new URL(request.url).pathname === DOCUMENT_KEY
    ) {
      const cache = await caches.open(DOCUMENT_CACHE);
      cache.put(DOCUMENT_KEY, response.clone()).catch(() => {});
    }

    return response;
  } catch {
    const cache = await caches.open(DOCUMENT_CACHE);
    const cached =
      (await cache.match(request)) || (await cache.match(DOCUMENT_KEY));
    if (cached) return cached;

    return new Response(OFFLINE_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    return new Response("Asset non disponibile offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url) || isBypassed(url)) return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
