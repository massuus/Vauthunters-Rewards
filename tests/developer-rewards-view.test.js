import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeveloperRewardView,
  renderDeveloperBadge,
} from '../public/js/features/developer-rewards.js';

test('Douwsky has the Janitor badge and keeps the reward toggle in both modes', () => {
  for (const id of ['7f618dfe4ca14d9a87130958b7fc3cf9', '7F618DFE-4CA1-4D9A-8713-0958B7FC3CF9']) {
    for (const showOverride of [true, false]) {
      const html = renderDeveloperBadge(
        { id, name: 'RenamedPlayer', isDeveloper: true },
        showOverride
      );
      assert.match(html, /Janitor<\/button>/);
      assert.match(html, /src="\/img\/badge\/Janitor.png"/);
      assert.match(html, /data-dev-toggle/);
      assert.doesNotMatch(html, /&lt;\/&gt;/);
    }
  }
});

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
