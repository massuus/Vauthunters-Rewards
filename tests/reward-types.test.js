import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRewardTypes, rewardType } from '../public/js/features/reward-types.js';
import { getPatreonRewardSets } from '../public/js/utils/tier-utils.js';
import { groupRewards } from '../public/js/components/special-pages/all-rewards-page.js';

test('rewards are grouped by equipment type instead of unlock category', () => {
  const entries = [
    ['mini_dweller', { label: 'Mini Dweller', category: 'Season 3 pass' }],
    ['baby_creeper_gold', { label: 'Golden Baby Creeper', category: 'Gemstone event' }],
    ['terra_armor', { label: 'Terra Armor', category: 'Golf Course event' }],
    ['forsaken_sword', { label: 'Forsaken Sword', category: 'Eternal progression' }],
  ];
  assert.deepEqual(
    groupRewards(entries).map(([type, rewards]) => [type, rewards.map(([key]) => key)]),
    [
      ['Companions', ['mini_dweller', 'baby_creeper_gold']],
      ['Armor', ['terra_armor']],
      ['Weapons', ['forsaken_sword']],
    ]
  );
});

test('mixed sets and non-model rewards receive stable reward types', () => {
  assert.equal(rewardType('dylan_vip'), 'Mixed Sets');
  assert.equal(rewardType('i85_spring_set'), 'Mixed Sets');
  assert.equal(rewardType('golden_mini_dweller'), 'Companions');
  assert.equal(rewardType('vhportal'), 'Companions');
  assert.equal(rewardType('skull_weapons'), 'Weapons');
  assert.equal(rewardType('nutcracker_wand'), 'Shields & Offhands');
  assert.equal(rewardType('hypefuse_scepter'), 'Shields & Offhands');
  assert.equal(rewardType('s3_hytale_wand'), 'Shields & Offhands');
  assert.equal(rewardType('duckfromhell_tribute_1'), 'Special Rewards');
  assert.ok(compareRewardTypes('Companions', 'Armor') < 0);
});

test('Patreon reward cards sort under their actual equipment types', () => {
  assert.equal(rewardType('patreon_dweller_gear'), 'Mixed Sets');
  assert.equal(rewardType('patreon_cheeser_gear'), 'Mixed Sets');
  assert.equal(rewardType('patreon_goblin_gear'), 'Armor');
  assert.equal(rewardType('patreon_champion_gear'), 'Mixed Sets');
  assert.equal(rewardType('patreon_legend_pet'), 'Companions');
});

test('Patreon gear sets unlock cumulatively through the highest player tier', () => {
  assert.deepEqual(getPatreonRewardSets([{ name: 'Vault Dweller' }]), ['patreon_dweller_gear']);
  assert.deepEqual(getPatreonRewardSets(['Vault Champion']), [
    'patreon_dweller_gear',
    'patreon_cheeser_gear',
    'patreon_goblin_gear',
    'patreon_champion_gear',
  ]);
  assert.deepEqual(getPatreonRewardSets(['Vault Legend']), [
    'patreon_dweller_gear',
    'patreon_cheeser_gear',
    'patreon_goblin_gear',
    'patreon_champion_gear',
    'patreon_legend_pet',
  ]);
  assert.deepEqual(getPatreonRewardSets([]), []);
});
