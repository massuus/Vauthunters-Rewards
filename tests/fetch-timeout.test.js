import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fetchJson, fetchWithRetry } from '../functions/utils/fetch-utils.js';
import { onRequest as lookupProfile } from '../functions/api/profile.js';
import { syncArmoryBatch } from '../functions/utils/leaderboard.js';

test(
  'upstream timeout covers a stalled JSON body after headers arrive',
  { timeout: 3000 },
  async (t) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"unfinished":');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    t.mock.method(console, 'error', () => {});
    const url = `http://127.0.0.1:${server.address().port}/stalled`;
    const result = await fetchJson(url, 'Stalled JSON', 80);
    assert.equal(result.error, true);
    assert.equal(result.isTimeout, true);
    const response = await fetchWithRetry(url, {}, 80, 0);
    await assert.rejects(response.json(), { name: 'AbortError' });
  }
);

test('discarded non-success JSON responses cancel their response streams', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const status of [400, 404]) {
    let cancelled = false;
    t.mock.method(
      globalThis,
      'fetch',
      async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          { status }
        )
    );
    const result = await fetchJson('https://example.test', 'Rejected response', 1000);
    assert.equal(cancelled, true);
    assert.equal(status === 404 ? result.notFound : result.error, true);
  }
});

test('profile and armory error paths release discarded bodies before returning', async (t) => {
  t.mock.method(console, 'error', () => {});
  for (const status of [400, 404, 403]) {
    let cancelled = false;
    t.mock.method(globalThis, 'fetch', async (url) => {
      if (!String(url).includes('playerdb')) return new Response(null, { status: 404 });
      return new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        { status }
      );
    });
    const response = await lookupProfile({
      request: new Request(`https://example.test/api/profile?username=ErrorBody${status}`),
      env: {},
    });
    assert.equal(response.status, status === 403 ? 502 : 404);
    assert.equal(cancelled, true);
  }
  let armoryCancelled = false;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          cancel() {
            armoryCancelled = true;
          },
        }),
        { status: 400 }
      )
  );
  await assert.rejects(syncArmoryBatch({ LEADERBOARD_DB: {} }), (error) => error.status === 400);
  assert.equal(armoryCancelled, true);
});
