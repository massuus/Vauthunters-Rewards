import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { collectPrecacheAssets } from '../scripts/precache-assets.js';

test('precache generation includes current modules and nested styles, excluding obsolete chunks', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vhr-precache-'));
  assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const publicDir = path.join(root, 'public');
  const output = path.join(root, 'dist');
  await fs.mkdir(path.join(publicDir, 'css', 'components'), { recursive: true });
  await fs.mkdir(path.join(output, 'chunks'), { recursive: true });
  await fs.writeFile(path.join(publicDir, 'css', 'main.css'), '');
  await fs.writeFile(path.join(publicDir, 'css', 'components', 'cards.css'), '');
  await fs.writeFile(path.join(output, 'chunks', 'obsolete.js'), '');
  const outputs = {
    [path.join(output, 'js', 'core', 'app.js')]: {},
    [path.join(output, 'chunks', 'current.js')]: {},
    [path.join(output, 'chunks', 'current.js.map')]: {},
  };
  assert.deepEqual(await collectPrecacheAssets({ outputs }, output, publicDir), [
    '/chunks/current.js',
    '/css/components/cards.css',
    '/css/main.css',
    '/js/core/app.js',
  ]);
});

const workerSource = await fs.readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

function workerHarness({ upgrading = false } = {}) {
  const origin = 'https://example.test';
  const stores = new Map();
  if (upgrading) {
    stores.set('vhr-static-old', new Map());
    stores.set('unrelated-app-cache', new Map());
  }
  const handlers = new Map();
  const key = (request) =>
    new URL(typeof request === 'string' ? request : request.url, origin).href;
  let offline = false;
  const missing = new Set();
  let skippedWaiting = false;
  const network = async (request) => {
    if (offline) throw new Error('Offline');
    const url = new URL(key(request));
    if (missing.has(url.pathname)) return new Response('Removed by deployment', { status: 404 });
    const type = url.pathname.endsWith('.js')
      ? 'application/javascript'
      : url.pathname.endsWith('.css')
        ? 'text/css'
        : 'text/html';
    return new Response(url.pathname, { headers: { 'content-type': type } });
  };
  const caches = {
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(urls) {
          assert.equal(new Set(urls).size, urls.length, 'Precache URLs must be unique');
          for (const url of urls) entries.set(key(url), await network(url));
        },
        async put(request, response) {
          entries.set(key(request), response);
        },
        async match(request) {
          return entries.get(key(request))?.clone();
        },
        async keys() {
          return [...entries.keys()].map((url) => new Request(url));
        },
      };
    },
    async match(request) {
      for (const entries of stores.values()) {
        if (entries.has(key(request))) return entries.get(key(request)).clone();
      }
    },
  };
  vm.runInNewContext(workerSource, {
    __BUILD_REV__: 'test',
    __PRECACHE_ASSETS__: ['/chunks/current.js', '/css/components/cards.css', '/js/core/app.js'],
    URL,
    Request,
    Response,
    Headers,
    Uint8Array,
    Date,
    caches,
    fetch: network,
    self: {
      location: { origin },
      clients: { async claim() {} },
      addEventListener(type, handler) {
        handlers.set(type, handler);
      },
      skipWaiting() {
        skippedWaiting = true;
      },
    },
  });
  return {
    goOffline() {
      offline = true;
    },
    removeNetworkAsset(pathname) {
      missing.add(pathname);
    },
    get skippedWaiting() {
      return skippedWaiting;
    },
    hasCache(name) {
      return stores.has(name);
    },
    async activate() {
      let pending;
      handlers.get('activate')({
        waitUntil(promise) {
          pending = promise;
        },
      });
      await pending;
    },
    async install() {
      let pending;
      handlers.get('install')({
        waitUntil(promise) {
          pending = promise;
        },
      });
      await pending;
    },
    async request(pathname) {
      let pending;
      handlers.get('fetch')({
        request: new Request(origin + pathname),
        waitUntil(promise) {
          void promise.catch(() => {});
        },
        respondWith(promise) {
          pending = promise;
        },
      });
      return pending;
    },
  };
}

test('installed worker serves compiled chunks, styles and sets-help when offline', async () => {
  const worker = workerHarness();
  await worker.install();
  assert.equal(worker.skippedWaiting, false, 'Updates must wait for existing controlled tabs');
  worker.goOffline();
  for (const pathname of [
    '/chunks/current.js',
    '/css/components/cards.css',
    '/templates/sets-help.html',
    '/data/set-art.json',
    '/data/codes.json',
  ]) {
    const response = await worker.request(pathname);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), pathname);
  }
  assert.equal(await worker.request('/api/auth/me'), undefined);
  assert.equal(await worker.request('/api/admin/companion-health'), undefined);
});

test('failed precaching does not activate an incomplete worker', async () => {
  const worker = workerHarness();
  worker.goOffline();
  await assert.rejects(worker.install(), /Offline/);
  assert.equal(worker.skippedWaiting, false);
});

test('cached modules remain usable when their URL returns 404 after a deployment', async () => {
  const worker = workerHarness();
  await worker.install();
  worker.removeNetworkAsset('/chunks/current.js');
  const response = await worker.request('/chunks/current.js');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '/chunks/current.js');
});

test('installing an update leaves old-tab caches intact until normal activation', async () => {
  const worker = workerHarness({ upgrading: true });
  await worker.install();
  assert.equal(worker.skippedWaiting, false);
  assert.equal(worker.hasCache('vhr-static-old'), true);
  // Simulate the browser activating only after the old controlled tabs close.
  await worker.activate();
  assert.equal(worker.hasCache('vhr-static-old'), false);
  assert.equal(worker.hasCache('unrelated-app-cache'), true);
});
