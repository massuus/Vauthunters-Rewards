import test from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '../public/js/core/logger.js';

test('set art loading shares in-flight work and caches a successful catalog', async (t) => {
  const { loadSetArt, getSetArtStore } = await import('../public/js/features/set-art.js?success');
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    requests += 1;
    return Response.json(url === '/api/sets' ? [] : { sample: { label: 'Sample' } });
  });
  const [first, second] = await Promise.all([loadSetArt(), loadSetArt()]);
  assert.equal(first, second);
  assert.equal(getSetArtStore().sample.label, 'Sample');
  assert.equal(requests, 2);
  assert.equal(await loadSetArt(), first);
  assert.equal(requests, 2);
});

test('a transient set art failure can recover on the next profile load', async (t) => {
  const { loadSetArt } = await import('../public/js/features/set-art.js?retry');
  t.mock.method(logger, 'error', () => {});
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (url === '/api/sets') return Response.json([]);
    attempts += 1;
    return attempts === 1
      ? new Response(null, { status: 503 })
      : Response.json({ recovered: { label: 'Recovered' } });
  });
  assert.deepEqual(await loadSetArt(), {});
  assert.equal((await loadSetArt()).recovered.label, 'Recovered');
  assert.equal(attempts, 2);
});
