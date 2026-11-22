import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/server.js';
import { renderOfficialServersPage } from '../public/js/components/special-pages/servers-page.js';

test('server API maps online players, supports legacy rosters, and respects empty live lists', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json([
      { players: [], status: { players: [{ name: 'OnlinePlayer', id: 'uuid' }] } },
      { players: [{ ign: 'LegacyPlayer', active: false, hasAccess: false }] },
      { players: [{ ign: 'OfflinePlayer' }], status: { players: [] } },
    ])
  );
  const response = await onRequest();
  assert.equal(response.status, 200);
  const servers = await response.json();
  assert.deepEqual(
    servers.map((server) => server.players),
    [
      [{ ign: 'OnlinePlayer', active: true, hasAccess: true }],
      [{ ign: 'LegacyPlayer', active: false, hasAccess: false }],
      [],
    ]
  );
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60, s-maxage=60');
});

test('servers page includes empty visible servers and excludes hidden servers', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json([
      { _id: 'empty', name: 'Empty Server', region: 'Europe', players: [], maxPlayers: 30 },
      { _id: 'hidden', name: 'Hidden Server', region: 'Europe', isVisible: false, players: [] },
    ])
  );
  const originalDocument = globalThis.document;
  globalThis.document = {};
  const container = {
    classList: { remove() {} },
    innerHTML: '',
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  try {
    await renderOfficialServersPage(
      container,
      () => {},
      () => {},
      () => {},
      (value) => value,
      '/favicon.ico',
      {},
      {}
    );
    assert.match(container.innerHTML, /Empty Server/);
    assert.match(container.innerHTML, /0\/30/);
    assert.match(container.innerHTML, /1 server across 1 region/);
    assert.doesNotMatch(container.innerHTML, /Hidden Server/);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
