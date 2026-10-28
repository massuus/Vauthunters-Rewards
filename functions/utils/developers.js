// UUID list extracted from IskalliaDevs in the_vault 21.6.1-remastered.6956.
// Match verified Minecraft UUIDs only; names are documentation, not identity checks.
import developers from '../data/developers.json';

export const DEVELOPERS = Object.freeze(developers);

const developerIds = new Set(Object.values(DEVELOPERS).map((uuid) => uuid.replaceAll('-', '')));

export function isDeveloper(uuid) {
  if (typeof uuid !== 'string') return false;
  const normalized = uuid.toLowerCase();
  if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(normalized))
    return false;
  return developerIds.has(normalized.replaceAll('-', ''));
}

export function grantDeveloperRewards(current, catalog) {
  const sets = new Set(current.sets || []);
  const rewards = Object.fromEntries(
    Object.entries(current.rewards || {}).map(([item, models]) => [item, [...models]])
  );
  for (const entry of catalog) {
    if (typeof entry?.id !== 'string' || !entry.id) continue;
    sets.add(entry.id);
    for (const [item, models] of Object.entries(entry.sets || {})) {
      if (!Array.isArray(models) || ['__proto__', 'constructor', 'prototype'].includes(item))
        continue;
      rewards[item] = [
        ...new Set([
          ...(rewards[item] || []),
          ...models.filter((model) => typeof model === 'string'),
        ]),
      ];
    }
  }
  return { sets: [...sets], rewards };
}
