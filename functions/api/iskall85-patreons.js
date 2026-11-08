import { TIER_LIST_URL } from '../utils/config.js';
import { methodNotAllowed } from '../utils/http.js';

const TIER_RANK = new Map([
  ['Emerald', 5],
  ['Iskallium Diamond', 4],
  ['Diamond', 3],
  ['Gold', 2],
  ['Iron', 1],
]);

export function normalizeIskall85PatreonRoster(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return Object.entries(payload)
    .filter(
      ([name, entry]) => name && name.toLowerCase() !== 'null' && TIER_RANK.has(entry?.iskall85)
    )
    .map(([ign, entry]) => ({ ign, tier: entry.iskall85 }))
    .sort(
      (a, b) =>
        TIER_RANK.get(b.tier) - TIER_RANK.get(a.tier) ||
        a.ign.localeCompare(b.ign, 'en', { sensitivity: 'base' })
    );
}

export async function onRequest({ request }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const response = await fetch(TIER_LIST_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    return Response.json({ error: 'Iskall85 Patreon roster unavailable' }, { status: 502 });
  return Response.json(normalizeIskall85PatreonRoster(await response.json()), {
    headers: { 'cache-control': 'public, max-age=300, s-maxage=900' },
  });
}
