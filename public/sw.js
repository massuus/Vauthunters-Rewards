// Service Worker with caching strategy
// Cache version and configuration is managed in config.js but duplicated here
// since service workers can't import ES modules in all browsers yet

// This value is injected at build time via esbuild define; falls back to 'dev'
const CACHE_VERSION = typeof __BUILD_REV__ !== 'undefined' ? __BUILD_REV__ : 'dev';
const STATIC_CACHE = `vhr-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `vhr-runtime-${CACHE_VERSION}`;
const TEMPLATE_CACHE = `vhr-templates-${CACHE_VERSION}`;
const DATA_CACHE = `vhr-data-${CACHE_VERSION}`;

// Cache size limits (number of entries)
const MAX_RUNTIME_CACHE_SIZE = 100;
const MAX_IMAGE_CACHE_SIZE = 200;
const MAX_TEMPLATE_CACHE_SIZE = 50;

// Cache TTL
const API_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DATA_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (codes/sets data)
const CACHE_TIMESTAMP_HEADER = 'x-vhr-sw-cached-at';

const STATIC_ASSETS = [
  '/',
  '/pages/index.html',
  '/css/main.css',
  '/js/core/app.js',
  '/data/set-art.json',
  '/data/codes.json',
  '/pages/offline.html',
];

const TEMPLATE_ASSETS = [
  'player-card.html',
  'loading-skeleton.html',
  'reward-group.html',
  'recent-section.html',
];

/**
 * Trim cache to maximum size by removing oldest entries
 */
async function trimCache(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxSize) {
    // Remove oldest entries (FIFO)
    const toDelete = keys.slice(0, keys.length - maxSize);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(TEMPLATE_CACHE).then((cache) => {
        return Promise.all(
          TEMPLATE_ASSETS.map((name) =>
            fetch(`/templates/${name}`)
              .then((r) => cache.put(`/templates/${name}`, r.clone()))
              .catch(() => {})
          )
        );
      }),
    ]).then(() => self.skipWaiting())
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

      // Clean up old caches
      const keys = await caches.keys();
      const validCaches = [STATIC_CACHE, RUNTIME_CACHE, TEMPLATE_CACHE, DATA_CACHE];
      await Promise.all(
        keys.filter((key) => !validCaches.includes(key)).map((key) => caches.delete(key))
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
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Only handle same-origin requests here; let cross-origin bypass SW
  if (url.origin !== self.location.origin) {
    return;
  }

  // Handle navigation with preload/network-first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) {
            const copy = preload.clone();
            caches
              .open(STATIC_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
            return preload;
          }
        } catch {}
        try {
          const response = await fetch(request);
          caches
            .open(STATIC_CACHE)
            .then((cache) => cache.put(request, response.clone()))
            .catch(() => {});
          return response;
        } catch {
          // Network failed - try cache
          const cached = await caches.match(request);
          if (cached) return cached;

          // No cache - return offline page
          const offlinePage = await caches.match('/pages/offline.html');
          if (offlinePage) return offlinePage;

          // Fallback to a simple offline response
          return new Response(
            '<html><body><h1>Offline</h1><p>Please check your connection.</p></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html' } }
          );
        }
      })()
    );
    return;
  }

  // Cache-first for images (includes proxied image URLs)
  if (isImageRequest(request)) {
    event.respondWith(
      (async () => {
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
            // Trim cache size after adding
            trimCache(RUNTIME_CACHE, MAX_IMAGE_CACHE_SIZE).catch(() => {});
          }
          return response;
        } catch {
          if (cached) return cached; // last resort
          // Return a transparent 1x1 pixel as fallback
          return new Response(
            new Uint8Array([
              0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff,
              0xff, 0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c,
              0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00,
              0x3b,
            ]),
            { status: 200, headers: { 'Content-Type': 'image/gif' } }
          );
        }
      })()
    );
    return;
  }

  // Cache API responses for short TTL with stale-while-revalidate
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);

      // Cache template requests with longer TTL
      if (url.pathname.startsWith('/templates/') && url.pathname.endsWith('.html')) {
        event.respondWith(
          (async () => {
            const cache = await caches.open(TEMPLATE_CACHE);
            const cached = await cache.match(request);
            if (cached) {
              // Revalidate in background
              event.waitUntil(
                (async () => {
                  try {
                    const net = await fetch(request);
                    if (net.ok) await cache.put(request, net.clone());
                  } catch {}
                })()
              );
              return cached;
            }
            try {
              const net = await fetch(request);
              if (net.ok) await cache.put(request, net.clone());
              return net;
            } catch {
              return new Response('Template not found', { status: 404 });
            }
          })()
        );
        return;
      }

      // Cache data requests (codes, sets) with longer TTL
      if (url.pathname === '/data/codes.json' || url.pathname === '/data/set-art.json') {
        event.respondWith(
          (async () => {
            const cache = await caches.open(DATA_CACHE);
            const cached = await cache.match(request);
            const now = Date.now();
            let cachedAt = 0;
            if (cached) {
              cachedAt = Number(cached.headers.get(CACHE_TIMESTAMP_HEADER) || '0');
              if (Number.isFinite(cachedAt) && now - cachedAt < DATA_CACHE_TTL_MS) {
                // Fresh enough; revalidate in background
                event.waitUntil(
                  (async () => {
                    try {
                      const net = await fetch(request);
                      if (net.ok) {
                        const headers = new Headers(net.headers);
                        headers.set(CACHE_TIMESTAMP_HEADER, String(Date.now()));
                        const toStore = new Response(net.clone().body, {
                          status: net.status,
                          statusText: net.statusText,
                          headers,
                        });
                        await cache.put(request, toStore);
                      }
                    } catch {}
                  })()
                );
                return cached;
              }
            }
            try {
              const net = await fetch(request);
              if (net.ok) {
                const headers = new Headers(net.headers);
                headers.set(CACHE_TIMESTAMP_HEADER, String(Date.now()));
                const toStore = new Response(net.clone().body, {
                  status: net.status,
                  statusText: net.statusText,
                  headers,
                });
                await cache.put(request, toStore);
                trimCache(DATA_CACHE, MAX_TEMPLATE_CACHE_SIZE).catch(() => {});
              }
              return net;
            } catch (error) {
              if (cached) return cached;
              throw error;
            }
          })()
        );
        return;
      }

      if (url.origin === self.location.origin && url.pathname === '/api/profile') {
        event.respondWith(
          (async () => {
            const cache = await caches.open(RUNTIME_CACHE);
            const cached = await cache.match(request);
            const now = Date.now();
            let cachedAt = 0;
            if (cached) {
              cachedAt = Number(cached.headers.get(CACHE_TIMESTAMP_HEADER) || '0');
              if (Number.isFinite(cachedAt) && now - cachedAt < API_CACHE_TTL_MS) {
                // Fresh enough; revalidate in background
                event.waitUntil(
                  (async () => {
                    try {
                      const net = await fetch(request);
                      if (net.ok) {
                        const headers = new Headers(net.headers);
                        headers.set(CACHE_TIMESTAMP_HEADER, String(Date.now()));
                        const toStore = new Response(net.clone().body, {
                          status: net.status,
                          statusText: net.statusText,
                          headers,
                        });
                        await cache.put(request, toStore);
                      }
                    } catch {}
                  })()
                );
                return cached;
              }
            }

            // No cached or expired -> try network
            try {
              const net = await fetch(request);
              if (net.ok) {
                const headers = new Headers(net.headers);
                headers.set(CACHE_TIMESTAMP_HEADER, String(Date.now()));
                const toStore = new Response(net.clone().body, {
                  status: net.status,
                  statusText: net.statusText,
                  headers,
                });
                await cache.put(request, toStore);
                // Trim cache size
                trimCache(RUNTIME_CACHE, MAX_RUNTIME_CACHE_SIZE).catch(() => {});
              }
              return net;
            } catch (error) {
              // Network failed; fall back to stale cache if present
              if (cached) return cached;
              throw error;
            }
          })()
        );
        return;
      }
    } catch {}
  }

  // Default: try network, fall back to cache; always return a Response
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cached = await caches.match(request);
        return cached || Response.error();
      }
    })()
  );
});
