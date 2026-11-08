export const REWARD_TYPE_ORDER = [
  'Companions',
  'Armor',
  'Weapons',
  'Shields & Offhands',
  'Magnets',
  'Mixed Sets',
  'Special Rewards',
];

const COMPANIONS = new Set([
  'baby_creeper_gold',
  'baby_creeper_pog',
  'i85_companion_dino',
  'i85_dylan_penguin',
  'pink_dylan',
  'golden_dylan',
  'bumbo_cactoni',
  'golden_bumbo_cactoni',
  'carrot',
  'tommy',
  'greg',
  'gingerbread_man',
  'bumbo_frostoni',
  'blueberry_turtle',
  'valentines_teddy',
  'muddy_elephant',
  'mini_dweller',
  'mini_butcher',
  'mini_elite_witherskelly',
  'mini_goblin',
  'golden_mini_dweller',
  'vhportal',
  'patreon_legend_pet',
]);

const ARMOR = new Set([
  'companion_leader_s1',
  'i85_royale_crown',
  'i85_server_bingos',
  'iskall85_falcon_helmet',
  'iskall85_falcon_chestplate',
  'sculk_set',
  'forsaken_set',
  'green_christmas_hat',
  'xmas_dayfour_chest',
  'snowman_helmet',
  'striker',
  'girl_boss',
  'hellboy_head',
  'retirement',
  'terra_armor',
  'bat_chestplate_transmog',
  'patreon_goblin_gear',
]);

const SHIELDS_AND_OFFHANDS = new Set([
  'golden_kappa',
  'i85_treasure_train',
  'iskall85_ancient_scroll',
  'i85_mattress',
  'nocturn_shield',
  'midnight_thorn',
  'lamenting_mirror',
  'essence_of_iskallium',
  'never_ever',
  'christmas_fireplace',
  'terra_offhands',
  'hypefuse_scepter',
  'nutcracker_wand',
  's3_hytale_wand',
]);

const MAGNETS = new Set(['halloween_magnet']);
const MIXED_SETS = new Set([
  'dylan_vip',
  'i85_spring_set',
  'halloween_pumpkin',
  'i85_xmas_day3',
  'patreon_dweller_gear',
  'patreon_cheeser_gear',
  'patreon_champion_gear',
]);

const WEAPONS = new Set([
  'iskall85_reddragon_axe',
  'iskall85_reddragon_sword',
  'i85_petal_splitter',
  'i85_twin_blade',
  'forsaken_axe',
  'forsaken_sword',
  'doomslayer',
  'arry_axe',
  'skull_weapons',
  'i85_100stream',
  'lost_christmas_axe',
  'buster_sword',
  'terra_weapons',
  'bat_axe_transmog',
  'golden_club',
]);

export function rewardType(key, data = {}) {
  if (COMPANIONS.has(key)) return 'Companions';
  if (ARMOR.has(key)) return 'Armor';
  if (WEAPONS.has(key)) return 'Weapons';
  if (SHIELDS_AND_OFFHANDS.has(key)) return 'Shields & Offhands';
  if (MAGNETS.has(key)) return 'Magnets';
  if (MIXED_SETS.has(key)) return 'Mixed Sets';

  const label = String(data.label || key).toLowerCase();
  if (/companion|mini dweller|mini butcher|mini goblin/.test(label)) return 'Companions';
  if (/helmet|chestplate|leggings|boots|armor|armour|crown/.test(label)) return 'Armor';
  if (/shield|focus|offhand|scroll|mirror|wand|scepter/.test(label)) return 'Shields & Offhands';
  if (/magnet/.test(label)) return 'Magnets';
  if (/sword|blade|axe|club|dagger|weapon/.test(label)) return 'Weapons';
  return 'Special Rewards';
}

export function compareRewardTypes(a, b) {
  const rank = (type) => {
    const index = REWARD_TYPE_ORDER.indexOf(type);
    return index < 0 ? REWARD_TYPE_ORDER.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}
