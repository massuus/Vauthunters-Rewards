import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getProfileOverride,
  isTributeProfile,
  mergeUniqueSets,
  prioritizeSets,
} from '../functions/api/profile.js';

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
