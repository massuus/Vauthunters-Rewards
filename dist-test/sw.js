var d = '1772313807742',
  p = `vhr-static-${d}`,
  f = `vhr-runtime-${d}`,
  m = `vhr-templates-${d}`,
  x = `vhr-data-${d}`,
  y = 100,
  E = 200,
  T = 50,
  _ = 600 * 1e3,
  A = 3600 * 1e3,
  u = 'x-vhr-sw-cached-at',
  g = ['/', '/pages/index.html', '/css/main.css', '/js/core/app.js', '/pages/offline.html'],
  C = ['player-card.html', 'loading-skeleton.html', 'reward-group.html', 'recent-section.html'];
async function w(c, t) {
  let i = await caches.open(c),
    e = await i.keys();
  if (e.length > t) {
    let n = e.slice(0, e.length - t);
    await Promise.all(n.map((s) => i.delete(s)));
  }
}
self.addEventListener('install', (c) => {
  c.waitUntil(
    Promise.all([
      caches.open(p).then((t) => t.addAll(g)),
      caches.open(m).then((t) =>
        Promise.all(
          C.map((i) =>
            fetch(`/templates/${i}`)
              .then((e) => t.put(`/templates/${i}`, e.clone()))
              .catch(() => {})
          )
        )
      ),
    ]).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (c) => {
  c.waitUntil(
    (async () => {
      try {
        self.registration.navigationPreload && (await self.registration.navigationPreload.enable());
      } catch {}
      let t = await caches.keys(),
        i = [p, f, m, x];
      (await Promise.all(t.filter((e) => !i.includes(e)).map((e) => caches.delete(e))),
        await self.clients.claim());
    })()
  );
});
function S(c) {
  try {
    let t = new URL(c.url);
    return !!(c.destination === 'image' || t.pathname.startsWith('/img'));
  } catch {
    return !1;
  }
}
self.addEventListener('fetch', (c) => {
  let { request: t } = c,
    i;
  try {
    i = new URL(t.url);
  } catch {
    return;
  }
  if (i.origin === self.location.origin) {
    if (t.mode === 'navigate') {
      c.respondWith(
        (async () => {
          try {
            let e = await c.preloadResponse;
            if (e) {
              let n = e.clone();
              return (
                caches
                  .open(p)
                  .then((s) => s.put(t, n))
                  .catch(() => {}),
                e
              );
            }
          } catch {}
          try {
            let e = await fetch(t);
            return (
              caches
                .open(p)
                .then((n) => n.put(t, e.clone()))
                .catch(() => {}),
              e
            );
          } catch {
            let e = await caches.match(t);
            if (e) return e;
            let n = await caches.match('/pages/offline.html');
            return (
              n ||
              new Response(
                '<html><body><h1>Offline</h1><p>Please check your connection.</p></body></html>',
                { status: 503, headers: { 'Content-Type': 'text/html' } }
              )
            );
          }
        })()
      );
      return;
    }
    if (S(t)) {
      c.respondWith(
        (async () => {
          let e = await caches.open(f),
            n = await e.match(t);
          if (n && n.ok) return n;
          try {
            let s = await fetch(t),
              r = s.headers.get('content-type') || '';
            return (
              s.ok &&
                /^image\//i.test(r) &&
                (e.put(t, s.clone()).catch(() => {}), w(f, E).catch(() => {})),
              s
            );
          } catch {
            return (
              n ||
              new Response(
                new Uint8Array([
                  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0, 33, 249, 4,
                  1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
                ]),
                { status: 200, headers: { 'Content-Type': 'image/gif' } }
              )
            );
          }
        })()
      );
      return;
    }
    if (t.method === 'GET')
      try {
        let e = new URL(t.url);
        if (e.pathname.startsWith('/templates/') && e.pathname.endsWith('.html')) {
          c.respondWith(
            (async () => {
              let n = await caches.open(m),
                s = await n.match(t);
              if (s)
                return (
                  c.waitUntil(
                    (async () => {
                      try {
                        let r = await fetch(t);
                        r.ok && (await n.put(t, r.clone()));
                      } catch {}
                    })()
                  ),
                  s
                );
              try {
                let r = await fetch(t);
                return (r.ok && (await n.put(t, r.clone())), r);
              } catch {
                return new Response('Template not found', { status: 404 });
              }
            })()
          );
          return;
        }
        if (e.pathname === '/api/codes' || e.pathname === '/api/set-art') {
          c.respondWith(
            (async () => {
              let n = await caches.open(x),
                s = await n.match(t),
                r = Date.now(),
                h = 0;
              if (s && ((h = Number(s.headers.get(u) || '0')), Number.isFinite(h) && r - h < A))
                return (
                  c.waitUntil(
                    (async () => {
                      try {
                        let a = await fetch(t);
                        if (a.ok) {
                          let o = new Headers(a.headers);
                          o.set(u, String(Date.now()));
                          let l = new Response(a.clone().body, {
                            status: a.status,
                            statusText: a.statusText,
                            headers: o,
                          });
                          await n.put(t, l);
                        }
                      } catch {}
                    })()
                  ),
                  s
                );
              try {
                let a = await fetch(t);
                if (a.ok) {
                  let o = new Headers(a.headers);
                  o.set(u, String(Date.now()));
                  let l = new Response(a.clone().body, {
                    status: a.status,
                    statusText: a.statusText,
                    headers: o,
                  });
                  (await n.put(t, l), w(x, T).catch(() => {}));
                }
                return a;
              } catch (a) {
                if (s) return s;
                throw a;
              }
            })()
          );
          return;
        }
        if (e.origin === self.location.origin && e.pathname === '/api/profile') {
          c.respondWith(
            (async () => {
              let n = await caches.open(f),
                s = await n.match(t),
                r = Date.now(),
                h = 0;
              if (s && ((h = Number(s.headers.get(u) || '0')), Number.isFinite(h) && r - h < _))
                return (
                  c.waitUntil(
                    (async () => {
                      try {
                        let a = await fetch(t);
                        if (a.ok) {
                          let o = new Headers(a.headers);
                          o.set(u, String(Date.now()));
                          let l = new Response(a.clone().body, {
                            status: a.status,
                            statusText: a.statusText,
                            headers: o,
                          });
                          await n.put(t, l);
                        }
                      } catch {}
                    })()
                  ),
                  s
                );
              try {
                let a = await fetch(t);
                if (a.ok) {
                  let o = new Headers(a.headers);
                  o.set(u, String(Date.now()));
                  let l = new Response(a.clone().body, {
                    status: a.status,
                    statusText: a.statusText,
                    headers: o,
                  });
                  (await n.put(t, l), w(f, y).catch(() => {}));
                }
                return a;
              } catch (a) {
                if (s) return s;
                throw a;
              }
            })()
          );
          return;
        }
      } catch {}
    c.respondWith(
      (async () => {
        try {
          return await fetch(t);
        } catch {
          return (await caches.match(t)) || Response.error();
        }
      })()
    );
  }
});
