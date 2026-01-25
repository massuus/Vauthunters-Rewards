// Patreon tier utilities

const TIER_CONFIG = {
  'vault legend': { rank: 5, color: '#71ff9e', badge: '/img/badge/legend.webp' },
  'vault champion': { rank: 4, color: '#a2ff00', badge: '/img/badge/champion.webp' },
  'vault goblin': { rank: 3, color: '#00ff6c', badge: '/img/badge/goblin.webp' },
  'vault cheeser': { rank: 2, color: '#f3dc00', badge: '/img/badge/cheeser.webp' },
  'vault dweller': { rank: 1, color: '#dc1717', badge: '/img/badge/dweller.webp' },
};

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

/**
 * Get tier configuration
 * @returns {Object} Tier configuration object
 */
export function getTierConfig() {
  return TIER_CONFIG;
}
