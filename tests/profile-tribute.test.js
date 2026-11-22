import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../public/data/set-art.json';

import {
  getProfileOverride,
  isTributeProfile,
  mergeUniqueSets,
  prioritizeSets,
  onRequest,
} from '../functions/api/profile.js';

test('tribute profile includes the full bundled catalog without a static asset request', async (t) => {
  let assetRequests = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    const value = String(url);
    if (value.includes('playerdb'))
      return Response.json({
        success: true,
        data: { player: { username: 'KingoDogo', raw_id: 'a37759b7a74143b6b8f1f1e4668072d0' } },
      });
    if (value.includes('/users/reward/list')) return Response.json({});
    if (value.includes('/users/reward?uuid=')) return Response.json({ tier: [] });
    if (value.includes('/rewards?minecraft=')) return Response.json({ sets: [], rewards: {} });
    assetRequests += 1;
    return new Response('Forbidden', { status: 403 });
  });
  const response = await onRequest({
    request: new Request('https://example.test/api/profile?username=KingoDogo'),
    env: {
      ASSETS: {
        fetch() {
          assetRequests += 1;
          return new Response('Forbidden', { status: 403 });
        },
      },
    },
  });
  assert.equal(response.status, 200);
  const profile = await response.json();
  for (const key of Object.keys(catalog)) assert.ok(profile.sets.includes(key), key);
  assert.equal(profile.sets[0], 'kingodogo_tribute');
  assert.equal(assetRequests, 0);
});

test('matches the tribute profile username case-insensitively', () => {
  assert.equal(isTributeProfile('duckfromhell'), true);
  assert.equal(isTributeProfile('DuckFromHell'), true);
  assert.equal(isTributeProfile('kingodogo'), true);
  assert.equal(isTributeProfile('someone-else'), false);
});

test('resolves profile overrides for tribute accounts', () => {
  assert.deepEqual(getProfileOverride('duckfromhell')?.rewardKeys, [
    'duckfromhell_tribute_1',
    'duckfromhell_tribute_2',
  ]);
  assert.deepEqual(getProfileOverride('kingodogo')?.rewardKeys, ['kingodogo_tribute']);
  assert.equal(getProfileOverride('someone-else'), null);
});

test('merges unique sets without duplicates', () => {
  assert.deepEqual(
    mergeUniqueSets(['alpha', 'beta', 'alpha'], ['beta', 'gamma'], 'duckfromhell_tribute_1'),
    ['alpha', 'beta', 'gamma', 'duckfromhell_tribute_1']
  );
});

test('prioritizes tribute sets ahead of the rest', () => {
  assert.deepEqual(
    prioritizeSets(
      ['gamma', 'duckfromhell_tribute_2', 'alpha', 'dylan_vip', 'beta'],
      ['duckfromhell_tribute_1', 'duckfromhell_tribute_2', 'dylan_vip']
    ),
    ['duckfromhell_tribute_2', 'dylan_vip', 'gamma', 'alpha', 'beta']
  );
});

test('prioritizes kingodogo tribute first', () => {
  assert.deepEqual(
    prioritizeSets(
      ['beta', 'kingodogo_tribute', 'dylan_vip', 'alpha'],
      ['kingodogo_tribute', 'dylan_vip']
    ),
    ['kingodogo_tribute', 'dylan_vip', 'beta', 'alpha']
  );
});

test('preserves all custom tribute rewards when catalog lookup fails', () => {
  const override = getProfileOverride('duckfromhell');
  const sets = prioritizeSets(
    mergeUniqueSets(['golden_kappa'], [], ...override.rewardKeys),
    override.priorityKeys
  );
  assert.deepEqual(sets, ['duckfromhell_tribute_1', 'duckfromhell_tribute_2', 'golden_kappa']);
});

test('merges the full catalog and both custom tribute rewards', () => {
  const override = getProfileOverride('duckfromhell');
  const sets = prioritizeSets(
    mergeUniqueSets(['golden_kappa'], ['golden_kappa', 'new_reward'], ...override.rewardKeys),
    override.priorityKeys
  );
  assert.deepEqual(sets, [
    'duckfromhell_tribute_1',
    'duckfromhell_tribute_2',
    'golden_kappa',
    'new_reward',
  ]);
});
