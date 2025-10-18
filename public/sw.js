const CACHE_VERSION = 'v4';
const STATIC_CACHE = `vhr-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `vhr-runtime-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/set-art.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Enable navigation preload for faster navigations
      try {
        if (self.registration.navigationPreload) {
          await self.registration.navigationPreload.enable();
        }
      } catch {}

      const keys = await caches.keys();
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isImageRequest(request) {
  try {
    const url = new URL(request.url);
    if (request.destination === 'image') return true;
    if (url.pathname.startsWith('/img')) return true; // our proxy endpoint
    return false;
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  let url;
  try { url = new URL(request.url); } catch { return; }

  // Only handle same-origin requests here; let cross-origin bypass SW
  if (url.origin !== self.location.origin) {
    return;
  }

  // Handle navigation with preload/network-first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) {
          const copy = preload.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return preload;
        }
      } catch {}
      try {
        const response = await fetch(request);
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
        return response;
      } catch {
        const cached = await caches.match(request);
        return cached || caches.match('/index.html');
      }
    })());
    return;
  }

  // Cache-first for images (includes proxied image URLs)
  if (isImageRequest(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      if (cached && cached.ok) {
        return cached;
      }
      try {
        const response = await fetch(request);
        const ct = response.headers.get('content-type') || '';
        if (response.ok && /^image\//i.test(ct)) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (err) {
        if (cached) return cached; // last resort
        throw err;
      }
    })());
    return;
  }

  // Cache API responses for short TTL with stale-while-revalidate
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      if (url.origin === self.location.origin && url.pathname === '/api/profile') {
        const TTL_MS = 10 * 60 * 1000; // 10 minutes
        event.respondWith((async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          const cached = await cache.match(request);
          const now = Date.now();
          let cachedAt = 0;
          if (cached) {
            cachedAt = Number(cached.headers.get('x-sw-cached-at') || '0');
            if (Number.isFinite(cachedAt) && (now - cachedAt) < TTL_MS) {
              // Fresh enough; revalidate in background
              event.waitUntil((async () => {
                try {
                  const net = await fetch(request);
                  if (net.ok) {
                    const headers = new Headers(net.headers);
                    headers.set('x-sw-cached-at', String(Date.now()));
                    const toStore = new Response(net.clone().body, { status: net.status, statusText: net.statusText, headers });
                    await cache.put(request, toStore);
                  }
                } catch {}
              })());
              return cached;
            }
          }

          // No cached or expired -> try network
          try {
            const net = await fetch(request);
            if (net.ok) {
              const headers = new Headers(net.headers);
              headers.set('x-sw-cached-at', String(Date.now()));
              const toStore = new Response(net.clone().body, { status: net.status, statusText: net.statusText, headers });
              await cache.put(request, toStore);
            }
            return net;
          } catch (e) {
            // Network failed; fall back to stale cache if present
            if (cached) return cached;
            throw e;
          }
        })());
        return;
      }
    } catch {}
  }

  // Default: try network, fall back to cache; always return a Response
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cached = await caches.match(request);
      return cached || Response.error();
    }
  })());
});
