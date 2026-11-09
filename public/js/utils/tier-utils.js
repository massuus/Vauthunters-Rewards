// Patreon tier utilities

const TIER_CONFIG = {
  'vault legend': { rank: 5, color: '#71ff9e', badge: '/img/badge/legend.webp' },
  'vault champion': { rank: 4, color: '#a2ff00', badge: '/img/badge/champion.webp' },
  'vault goblin': { rank: 3, color: '#00ff6c', badge: '/img/badge/goblin.webp' },
  'vault cheeser': { rank: 2, color: '#f3dc00', badge: '/img/badge/cheeser.webp' },
  'vault dweller': { rank: 1, color: '#dc1717', badge: '/img/badge/dweller.webp' },
};

const PATREON_REWARD_SETS = [
  'patreon_dweller_gear',
  'patreon_cheeser_gear',
  'patreon_goblin_gear',
  'patreon_champion_gear',
  'patreon_legend_pet',
];

/**
 * Get the best (highest rank) Patreon tier from an array of tiers
 * @param {Array} tiers - Array of tier objects or strings
 * @returns {Object|null} Best tier with name, rank, color, badge, or null if no valid tier found
 */
export function getBestPatreonTier(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return null;
  }

  let bestTier = null;
  let bestRank = 0;

  tiers.forEach((tier) => {
    const tierName = typeof tier === 'object' && tier.name ? tier.name : String(tier);
    const tierKey = tierName.toLowerCase();
    const config = TIER_CONFIG[tierKey];

    if (config && config.rank > bestRank) {
      bestRank = config.rank;
      bestTier = {
        name: tierName,
        ...config,
      };
    }
  });

  return bestTier;
}

export function getPatreonRewardSets(tiers) {
  const best = getBestPatreonTier(tiers);
  if (!best) return [];
  return PATREON_REWARD_SETS.slice(0, Math.min(best.rank, PATREON_REWARD_SETS.length));
}

const PATREON_INDIVIDUAL_REWARDS = [
  {
    'the_vault:boots': ['the_vault:gear/armor/dread_steps/boots'],
    'the_vault:sword': ['the_vault:gear/sword/dweller_sword'],
    'the_vault:axe': ['the_vault:gear/axe/dweller_axe'],
  },
  {
    'the_vault:helmet': ['the_vault:gear/armor/darkcheesewarrior/helmet'],
    'the_vault:chestplate': ['the_vault:gear/armor/darkcheesewarrior/chestplate'],
    'the_vault:leggings': ['the_vault:gear/armor/darkcheesewarrior/leggings'],
    'the_vault:boots': ['the_vault:gear/armor/darkcheesewarrior/boots'],
    'the_vault:sword': ['the_vault:gear/sword/plunder_n_cheese'],
  },
  {
    'the_vault:helmet': ['the_vault:gear/armor/goblin/helmet'],
    'the_vault:chestplate': [
      'the_vault:gear/armor/goblin/chestplate',
      'the_vault:gear/armor/hoarders_harness/chestplate',
    ],
    'the_vault:leggings': ['the_vault:gear/armor/goblin/leggings'],
    'the_vault:boots': ['the_vault:gear/armor/goblin/boots'],
  },
  {
    'the_vault:helmet': [
      'the_vault:gear/armor/champion/helmet',
      'the_vault:gear/armor/triumphant_crown/helmet',
    ],
    'the_vault:chestplate': ['the_vault:gear/armor/champion/chestplate'],
    'the_vault:leggings': ['the_vault:gear/armor/champion/leggings'],
    'the_vault:boots': ['the_vault:gear/armor/champion/boots'],
    'the_vault:axe': ['the_vault:gear/axe/godaxe'],
  },
  { 'the_vault:companion': ['the_vault:slimey'] },
];

export function addPatreonIndividualRewards(rewards, tiers) {
  const merged = Object.fromEntries(
    Object.entries(rewards || {}).map(([category, items]) => [
      category,
      Array.isArray(items) ? [...items] : [],
    ])
  );
  const best = getBestPatreonTier(tiers);
  if (!best) return merged;
  for (const tierRewards of PATREON_INDIVIDUAL_REWARDS.slice(0, best.rank)) {
    for (const [category, items] of Object.entries(tierRewards)) {
      merged[category] = Array.from(new Set([...(merged[category] || []), ...items]));
    }
  }
  return merged;
}
