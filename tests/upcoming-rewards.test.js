import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeApiSets } from '../public/js/features/reward-shop.js';

globalThis.document = { getElementById: () => null, querySelector: () => null, title: '' };
const { renderMissingRewardsSection } = await import('../public/js/components/profile-sections.js');
delete globalThis.document;

const data = JSON.parse(
  readFileSync(new URL('../public/data/set-art.json', import.meta.url), 'utf8')
);
const upcoming = ['girl_boss', 'mini_goblin', 'hellboy_head', 'golden_mini_dweller'];

test('future Season 3 rewards have their own missing section and exclude owned rewards', () => {
  const rewards = Object.fromEntries(upcoming.map((key) => [key, data[key]]));
  for (const item of Object.values(rewards)) {
    assert.equal(item.obtainable, false);
    assert.equal(item.upcoming, true);
  }
  const html = renderMissingRewardsSection(['girl_boss'], rewards);
  assert.match(html, /Coming Soon™ \(3\)/);
  assert.match(html, /id="missing-upcoming-panel"/);
  assert.doesNotMatch(html, /Still Obtainable|Currently Unavailable|data-set-key="girl_boss"/);
  assert.equal(renderMissingRewardsSection(upcoming, rewards), '');
});

test('a live shop release promotes an upcoming reward into obtainable rewards', () => {
  const merged = mergeApiSets({ girl_boss: data.girl_boss }, [
    { id: 'girl_boss', cost: 3000, price: 3000, unavailable: false },
  ]);
  assert.equal(merged.girl_boss.upcoming, false);
  assert.equal(merged.girl_boss.obtainable, true);
  assert.match(renderMissingRewardsSection([], merged), /Still Obtainable \(1\)/);
});
