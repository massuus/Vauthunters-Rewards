import test from 'node:test';
import assert from 'node:assert/strict';

test('tier lookups share in-flight work and expire after an hour', async (t) => {
  const { fetchIskall85TierList } = await import('../functions/services/patreon-tiers.js?expiry');
  let now = 1000;
  let calls = 0;
  let release;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    if (calls === 1)
      await new Promise((resolve) => {
        release = resolve;
      });
    return Response.json({ Alice: { iskall85: calls === 1 ? 'Iron' : 'Gold' } });
  });
  const first = fetchIskall85TierList();
  const concurrent = fetchIskall85TierList();
  assert.equal(calls, 1);
  release();
  const initial = await first;
  assert.deepEqual(await concurrent, initial);
  assert.equal((await fetchIskall85TierList()).Alice.iskall85, 'Iron');
  assert.equal(calls, 1);
  now += 60 * 60 * 1000;
  assert.equal((await fetchIskall85TierList()).Alice.iskall85, 'Gold');
  assert.equal(calls, 2);
});

test('a failed tier lookup can be retried and missing lists remain empty', async (t) => {
  const { fetchIskall85TierList } = await import('../functions/services/patreon-tiers.js?retry');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return calls === 1 ? Response.json(null) : new Response(null, { status: 404 });
  });
  await assert.rejects(fetchIskall85TierList(), (error) => error.status === 502);
  assert.deepEqual(await fetchIskall85TierList(), {});
  assert.deepEqual(await fetchIskall85TierList(), {});
  assert.equal(calls, 2);
});
