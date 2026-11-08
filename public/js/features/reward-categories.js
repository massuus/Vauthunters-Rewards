const CATEGORY_ORDER = [
  'Special gifts',
  'Battlepass Season 3',
  'Battlepass Eternal',
  'Horderush Event',
  'Halloween 2026',
  'Battlepass Season 2',
  'Christmas 2025',
  'Gemstone Event',
  'Twitch Event',
  'Server Event',
  'Halloween 2025',
  'Unobtainable',
  'Valentines 2026',
  'Patreon rewards',
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
