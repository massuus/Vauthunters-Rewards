import { json, methodNotAllowed, noStoreJson } from '../utils/http.js';
import { loadHealth } from '../utils/companion-health.js';
import { REWARDS_API_TIMEOUT, REWARDS_TWITCH_URL, getRewardsAuthHeaders } from '../utils/config.js';
import { fetchJson } from '../utils/fetch-utils.js';

const OFFICIAL_LOGINS = new Set([
  'hoy_82',
  'iskall85',
  'therealhellfirem4ge',
  'linahun',
  'mastercwg',
  'mayaicefire',
  'stressmonstah',
]);
const COMMUNITY_TAGS = new Set(['vaulthunters', 'vaulthunter', 'vh', 'vh3', 'vh4', 'vh5']);
const COMMUNITY_TITLE = /\bvault\s*hunters?\b|\bvh(?:3|4|5)\b/i;
const CACHE_SECONDS = 300;
const LINK_CHECK_CONCURRENCY = 4;

function normalizedTag(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function safeTwitchImage(value) {
  try {
    const url = new URL(
      String(value || '')
        .replace('{width}', '440')
        .replace('{height}', '248')
    );
    return url.protocol === 'https:' && url.hostname === 'static-cdn.jtvnw.net'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function communityStreamRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const login = String(row?.user_login || '').toLowerCase();
      if (!/^[a-z0-9_]{1,25}$/.test(login) || OFFICIAL_LOGINS.has(login)) return false;
      const tags = Array.isArray(row?.tags) ? row.tags : [];
      return (
        tags.some((tag) => COMMUNITY_TAGS.has(normalizedTag(tag))) ||
        COMMUNITY_TITLE.test(String(row?.title || ''))
      );
    })
    .slice(0, 24)
    .map((row) => ({
      login: String(row.user_login).toLowerCase(),
      displayName: String(row.user_name || row.user_login).slice(0, 64),
      title: String(row.title || '').slice(0, 160),
      viewerCount: Math.max(0, Number(row.viewer_count || 0)),
      startedAt: Number.isFinite(Date.parse(row.started_at)) ? row.started_at : null,
      language: /^[a-z]{2,5}$/i.test(String(row.language || '')) ? row.language : null,
      previewImageUrl: safeTwitchImage(row.thumbnail_url),
    }));
}

export async function addLinkedMinecraftAccounts(streamers, env, fetchJsonFn = fetchJson) {
  const rows = Array.isArray(streamers) ? streamers : [];
  const headers = getRewardsAuthHeaders(env);
  if (!headers || rows.length === 0) return rows;

  const enriched = new Array(rows.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < rows.length) {
      const index = nextIndex;
      nextIndex += 1;
      const streamer = rows[index];
      const result = await fetchJsonFn(
        `${REWARDS_TWITCH_URL}${encodeURIComponent(streamer.login)}`,
        'Community Minecraft link',
        REWARDS_API_TIMEOUT,
        headers
      );
      enriched[index] = {
        ...streamer,
        hasLinkedMinecraftAccount: Boolean(result?.data?.minecraftId),
      };
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(LINK_CHECK_CONCURRENCY, rows.length) }, () => worker())
  );
  return enriched;
}

async function twitchJson(url, options, message) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(message);
  return response.json();
}

async function discoverStreams(env, discoveredLogins = []) {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    throw new Error('Twitch is not configured.');
  }
  const auth = await twitchJson(
    'https://id.twitch.tv/oauth2/token',
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    },
    'Twitch authentication failed.'
  );
  const headers = {
    'Client-Id': env.TWITCH_CLIENT_ID,
    Authorization: `Bearer ${auth.access_token}`,
  };
  const games = await twitchJson(
    'https://api.twitch.tv/helix/games?name=Minecraft',
    { headers },
    'Minecraft category unavailable.'
  );
  const gameId = String(games?.data?.[0]?.id || '');
  if (!gameId) throw new Error('Minecraft category unavailable.');

  const rows = [];
  let cursor = '';
  for (let page = 0; page < 2; page += 1) {
    const url = new URL('https://api.twitch.tv/helix/streams');
    url.searchParams.set('game_id', gameId);
    url.searchParams.set('first', '100');
    if (cursor) url.searchParams.set('after', cursor);
    const payload = await twitchJson(url, { headers }, 'Twitch streams unavailable.');
    rows.push(...(Array.isArray(payload?.data) ? payload.data : []));
    cursor = String(payload?.pagination?.cursor || '');
    if (!cursor) break;
  }

  const knownUrl = new URL('https://api.twitch.tv/helix/streams');
  const knownLogins = [...new Set(discoveredLogins)].slice(0, 100);
  for (const login of knownLogins) knownUrl.searchParams.append('user_login', login);
  const known = knownLogins.length
    ? await twitchJson(knownUrl, { headers }, 'Known community streams unavailable.')
    : { data: [] };
  const uniqueRows = new Map(
    [...rows, ...(Array.isArray(known?.data) ? known.data : [])].map((row) => [
      String(row?.user_login || '').toLowerCase(),
      row,
    ])
  );
  return communityStreamRows([...uniqueRows.values()]);
}

function responseFor(streamers) {
  return json({ checkedAt: new Date().toISOString(), streamers }, 200, {
    'Cache-Control': `public, max-age=60, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const cacheKey = new Request(new URL('/api/community-live?v=2', request.url));
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    const health = await loadHealth(env).catch(() => null);
    const discoveredLogins = Array.isArray(health?.report?.communityDiscovery?.channels)
      ? health.report.communityDiscovery.channels
      : [];
    const streamers = await discoverStreams(env, discoveredLogins);
    const response = responseFor(await addLinkedMinecraftAccounts(streamers, env));
    context.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error('Community live discovery failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return noStoreJson({ error: 'Community streams are temporarily unavailable.' }, 503);
  }
}
