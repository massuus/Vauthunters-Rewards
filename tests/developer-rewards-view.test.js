import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeveloperRewardView,
  renderDeveloperBadge,
} from '../public/js/features/developer-rewards.js';

test('developer toggle switches sets and item rewards without changing profile data', () => {
  const profile = {
    isDeveloper: true,
    sets: ['owned', 'override'],
    rewards: { item: ['owned', 'override'] },
    apiRewards: { sets: ['owned'], rewards: { item: ['owned'] } },
  };
  assert.deepEqual(getDeveloperRewardView(profile).sets, ['owned', 'override']);
  assert.deepEqual(getDeveloperRewardView(profile, false), profile.apiRewards);
  assert.deepEqual(getDeveloperRewardView(profile, true).rewards, { item: ['owned', 'override'] });
  assert.match(renderDeveloperBadge(profile), /aria-pressed="true"/);
  assert.match(renderDeveloperBadge(profile, false), /Dev<\/button>/);
  assert.match(renderDeveloperBadge(profile, false), /aria-pressed="false"/);
  assert.equal(renderDeveloperBadge({}), '');
  assert.deepEqual(
    getDeveloperRewardView({ ...profile, isDeveloper: false }, false).sets,
    profile.sets
  );
});

test('CsaBa defaults to API rewards by UUID and can still toggle the override', () => {
  for (const id of ['18f179ee3dba4ce286508ef714f44e80', '18F179EE-3DBA-4CE2-8650-8EF714F44E80']) {
    const profile = {
      id,
      name: 'RenamedPlayer',
      isDeveloper: true,
      sets: ['owned', 'override'],
      rewards: {},
      apiRewards: { sets: ['owned'], rewards: {} },
    };
    assert.deepEqual(getDeveloperRewardView(profile), profile.apiRewards);
    assert.match(renderDeveloperBadge(profile), /aria-pressed="false"/);
    assert.deepEqual(getDeveloperRewardView(profile, true).sets, ['owned', 'override']);
    assert.deepEqual(getDeveloperRewardView({ ...profile, id: 'another-dev' }).sets, [
      'owned',
      'override',
    ]);
  }
});
