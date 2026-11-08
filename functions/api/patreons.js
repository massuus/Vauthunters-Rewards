import {
  PLAYERDB_PROFILE_URL,
  REWARDS_TWITCH_URL,
  TIER_LIST_URL,
  TIER_URL,
} from '../utils/config.js';
import { methodNotAllowed } from '../utils/http.js';

const TIER_RANK = new Map([
  ['Vault Legend', 5],
  ['Vault Champion', 4],
  ['Vault Goblin', 3],
  ['Vault Cheeser', 2],
  ['Vault Dweller', 1],
]);

export function normalizePatreonRoster(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return Object.entries(payload)
    .filter(
      ([ign, entry]) => ign && ign.toLowerCase() !== 'null' && TIER_RANK.has(entry?.vaultHunters)
    )
    .map(([ign, entry]) => ({ ign, tier: entry.vaultHunters }))
    .sort(
      (a, b) =>
        TIER_RANK.get(b.tier) - TIER_RANK.get(a.tier) ||
        a.ign.localeCompare(b.ign, 'en', { sensitivity: 'base' })
    );
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return null;
  return response.json();
}

function formatUuid(value) {
  const compact = String(value || '')
    .trim()
    .replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/i.test(compact)) return String(value || '').trim() || null;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

async function resolveMinecraftUuid(fetchImpl, name) {
  const linked = await fetchJson(
    fetchImpl,
    `${REWARDS_TWITCH_URL}${encodeURIComponent(name)}`
  ).catch(() => null);
  if (linked?.minecraftId) return formatUuid(linked.minecraftId);
  const profile = await fetchJson(
    fetchImpl,
    `${PLAYERDB_PROFILE_URL}${encodeURIComponent(name)}`
  ).catch(() => null);
  return formatUuid(profile?.data?.player?.id || profile?.data?.player?.raw_id);
}

async function hasLegendEntitlement(fetchImpl, player) {
  const uuid = await resolveMinecraftUuid(fetchImpl, player.ign);
  if (!uuid) return false;
  const entitlement = await fetchJson(fetchImpl, `${TIER_URL}${encodeURIComponent(uuid)}`).catch(
    () => null
  );
  return (
    Array.isArray(entitlement?.tier) &&
    entitlement.tier.some((tier) => tier?.name === 'Vault Legend')
  );
}

export async function resolveLegendTiers(roster, fetchImpl = fetch, concurrency = 12) {
  const candidates = roster.filter((player) => player.tier === 'Vault Champion');
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), candidates.length) },
    async () => {
      while (cursor < candidates.length) {
        const player = candidates[cursor++];
        if (await hasLegendEntitlement(fetchImpl, player)) player.tier = 'Vault Legend';
      }
    }
  );
  await Promise.all(workers);
  return roster.sort(
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
  if (!response.ok) return Response.json({ error: 'Patreon roster unavailable' }, { status: 502 });
  const roster = normalizePatreonRoster(await response.json());
  await resolveLegendTiers(roster);
  return Response.json(roster, {
    headers: { 'cache-control': 'public, max-age=300, s-maxage=900' },
  });
}
