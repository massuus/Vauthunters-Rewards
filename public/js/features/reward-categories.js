const CATEGORY_ORDER = [
  'Special gifts',
  'Eternal progression',
  'Season 3 pass',
  'Halloween 2026',
  'Golf Course event',
  'Season 2 pass',
  'Streaming milestones 2026',
  "Valentine's Day 2026",
  'Christmas 2025',
  'Vault Rush',
  'Horde Rush',
  'Halloween 2025',
  'Gemstone event',
  'Spring event 2025',
  'First Vault Royale',
  'Twitch Hype Trains',
  'Server Bingo',
];

export function compareRewardCategories(a, b) {
  if (a === b) return 0;
  if (a === 'Other rewards') return 1;
  if (b === 'Other rewards') return -1;
  const rank = (category) => {
    const index = CATEGORY_ORDER.indexOf(category);
    return index < 0 ? CATEGORY_ORDER.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}
