import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchRewards,
  fetchRewardsByTwitch,
  normalizeRewardsPayload,
} from '../functions/services/rewards.js';
import { fetchVaultHuntersTiers } from '../functions/services/patreon-tiers.js';

test('shared reward normalization canonicalizes aliases and deduplicates set names', () => {
  assert.deepEqual(
    normalizeRewardsPayload({
      rewards: { pet: ['example'] },
      sets: [' I85_SERVER_BINGO ', 'i85_servers_bingo', 'Other', 'other', ''],
    }),
    { rewards: { pet: ['example'] }, sets: ['i85_server_bingos', 'other'] }
  );
  assert.deepEqual(normalizeRewardsPayload({ rewards: [], sets: 'invalid' }), {
    rewards: {},
    sets: [],
  });
});

test('shared reward fetching preserves auth headers and Twitch identity fields', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return Response.json({ minecraftId: 'linked-id', rewards: {}, sets: [' I85_SERVER_BINGO '] });
  });
  const headers = { Authorization: 'Bearer example' };
  assert.deepEqual(await fetchRewards('player id', headers), {
    rewards: {},
    sets: ['i85_server_bingos'],
  });
  assert.equal((await fetchRewardsByTwitch('player name', headers)).minecraftId, 'linked-id');
  assert.ok(requests[0].url.endsWith('minecraft=player%20id'));
  assert.ok(requests[1].url.endsWith('twitchUsername=player%20name'));
  for (const { options } of requests)
    assert.equal(options.headers.Authorization, headers.Authorization);
});

test('missing Minecraft rewards and tiers stay empty while missing Twitch identities return 404', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  assert.deepEqual(await fetchRewards('uuid'), { rewards: {}, sets: [] });
  assert.deepEqual(await fetchVaultHuntersTiers('uuid'), []);
  await assert.rejects(fetchRewardsByTwitch('unknown'), (error) => error.status === 404);
});

test('shared upstream services retain failures instead of claiming missing entitlements', async (t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 400 }));
  for (const fetchData of [fetchRewards, fetchVaultHuntersTiers, fetchRewardsByTwitch]) {
    await assert.rejects(fetchData('example'), (error) => error.status === 502);
  }
});
