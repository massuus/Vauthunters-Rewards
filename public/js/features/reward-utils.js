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

function splitCodesText(text) {
  const source = String(text ?? '');
  const parts = [];
  const regex = /\bcode(s)?\b/gi;
  let lastIndex = 0;
  let match = null;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: source.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', value: match[0] });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < source.length) {
    parts.push({ type: 'text', value: source.slice(lastIndex) });
  }

  return parts;
}

export function buildCodesLinkedHtml(text, linkHref = '?codes') {
  return splitCodesText(text)
    .map((part) => {
      if (part.type === 'code') {
        return `<a class="inline-link" href="${linkHref}">${escapeHtml(part.value)}</a>`;
      }
      return escapeHtml(part.value);
    })
    .join('');
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
