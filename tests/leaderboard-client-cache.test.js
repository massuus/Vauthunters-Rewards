import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLeaderboardPage, clearLeaderboardCache } from '../public/js/features/leaderboard.js';

test('clearing leaderboard cache invalidates pending writes without detaching newer requests', async (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://example.test' } },
  });
  t.after(() => {
    clearLeaderboardCache();
    if (original) Object.defineProperty(globalThis, 'window', original);
    else delete globalThis.window;
  });
  const pending = [];
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => pending.push(resolve)));
  clearLeaderboardCache();
  const old = fetchLeaderboardPage();
  clearLeaderboardCache();
  const current = fetchLeaderboardPage();
  pending[0](Response.json({ total: 1 }));
  assert.equal((await old).total, 1);
  const joined = fetchLeaderboardPage();
  assert.equal(pending.length, 2, 'Old cleanup must not remove the new in-flight request');
  pending[1](Response.json({ total: 2 }));
  assert.equal((await current).total, 2);
  assert.equal((await joined).total, 2);
  assert.equal((await fetchLeaderboardPage()).total, 2);

  clearLeaderboardCache();
  const older = fetchLeaderboardPage();
  clearLeaderboardCache();
  const newer = fetchLeaderboardPage();
  pending[3](Response.json({ total: 4 }));
  await newer;
  pending[2](Response.json({ total: 3 }));
  await older;
  assert.equal(
    (await fetchLeaderboardPage()).total,
    4,
    'A late old response must not replace newer cached data'
  );
});
