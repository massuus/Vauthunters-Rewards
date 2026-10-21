import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/profile.js';

test('profile timings distinguish upstream work from cached responses', async (t) => {
  let cached;
  let requests = 0;
  const originalCaches = globalThis.caches;
  t.after(() => {
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
  });
  globalThis.caches = {
    default: {
      async match() {
        return cached?.clone();
      },
      async put(_key, response) {
        cached = response;
      },
    },
  };
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests++;
    const value = String(url);
    if (value.includes('playerdb'))
      return Response.json({
        success: true,
        data: { player: { username: 'TimingPlayer', raw_id: 'a37759b7a74143b6b8f1f1e4668072d0' } },
      });
    if (value.includes('/users/reward/list')) return Response.json({});
    if (value.includes('/users/reward?uuid=')) return Response.json({ tier: [] });
    if (value.includes('/rewards?minecraft=')) return Response.json({ sets: [], rewards: {} });
    throw new Error(`Unexpected request: ${value}`);
  });
  const context = {
    env: {},
    request: new Request('https://example.test/api/profile?username=TimingPlayer'),
  };
  const response = await onRequest(context);
  assert.equal(response.status, 200);
  const timings = response.headers.get('server-timing');
  for (const stage of ['identity', 'rewards', 'vh_tiers', 'iskall_tiers', 'cache', 'total']) {
    assert.match(timings, new RegExp(`${stage};dur=\\d+\\.\\d`));
  }
  assert.equal(cached.headers.has('server-timing'), false);
  const upstreamRequests = requests;
  const hit = await onRequest(context);
  assert.equal(requests, upstreamRequests);
  assert.match(hit.headers.get('server-timing'), /cache;dur=/);
  assert.doesNotMatch(hit.headers.get('server-timing'), /identity;dur=/);
  assert.deepEqual(await hit.json(), await response.json());
});
