// Reward processing and formatting utilities

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Convert text to snake_case for reward paths
 */
export function toSnake(text) {
  return text.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Derive the path to a reward image from its name
 */
export function deriveRewardPath(name, suffix = '') {
  const snakeName = toSnake(name);
  const suffixStr = suffix ? `_${suffix}` : '';
  return `/img/${snakeName}${suffixStr}.webp`;
}

/**
 * Derive the reward name from a snake_case path
 */
export function deriveRewardName(snakeName) {
  return snakeName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Augment reward sets with additional metadata
 */
export function augmentSets(sets) {
  try {
    const list = Array.isArray(sets) ? sets.slice() : [];
    return Array.from(new Set(list));
  } catch {
    return Array.isArray(sets) ? sets : [];
  }
}

/**
 * Format a label string with proper capitalization and special characters
 */
export function formatLabel(label) {
  return label
    .split('_')
    .map((word) => {
      // Handle special cases
      if (word.toLowerCase() === 'xp') return 'XP';
      if (word.toLowerCase() === 'hp') return 'HP';
      if (word.toLowerCase() === 'dmg') return 'DMG';
      // Normal capitalization
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
