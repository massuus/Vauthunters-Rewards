import { json, methodNotAllowed, noStoreJson } from '../utils/http.js';

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

async function twitchJson(url, options, message) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(message);
  return response.json();
}

async function discoverStreams(env) {
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
  return communityStreamRows(rows);
}

function responseFor(streamers) {
  return json({ checkedAt: new Date().toISOString(), streamers }, 200, {
    'Cache-Control': `public, max-age=60, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const cacheKey = new Request(new URL('/api/community-live?v=1', request.url));
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) return cached;
    const response = responseFor(await discoverStreams(env));
    context.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error('Community live discovery failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return noStoreJson({ error: 'Community streams are temporarily unavailable.' }, 503);
  }
}
