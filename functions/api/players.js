import { searchKnownPlayers } from '../utils/leaderboard.js';
import { apiRateLimiter, getRateLimitKey, rateLimitResponse } from '../utils/rate-limiter.js';

const BROWSER_CACHE_TTL_SECONDS = 60;
const EDGE_CACHE_TTL_SECONDS = 300;

function getDefaultCache() {
  try {
    return caches.default;
  } catch {
    return null;
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed.' },
      { status: 405, headers: { Allow: 'GET' } }
    );
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().toLowerCase();
  if (!/^[a-z0-9_ ]{2,32}$/i.test(query)) {
    return Response.json({ players: [] });
  }

  // Suggestions have a separate bucket so typing does not exhaust profile searches.
  const key = `player-suggestions:${getRateLimitKey(request)}`;
  if (!apiRateLimiter.allow(key)) return rateLimitResponse(apiRateLimiter.getInfo(key));

  const cache = getDefaultCache();
  const cacheUrl = new URL('/api/players', url.origin);
  cacheUrl.searchParams.set('q', query);
  const cacheRequest = new Request(cacheUrl, { method: 'GET' });
  if (cache) {
    const cached = await cache.match(cacheRequest);
    if (cached) return cached;
  }

  try {
    const players = await searchKnownPlayers(env, query);
    const response = Response.json(
      { players },
      {
        headers: {
          'cache-control': `public, max-age=${BROWSER_CACHE_TTL_SECONDS}, s-maxage=${EDGE_CACHE_TTL_SECONDS}`,
        },
      }
    );
    if (cache) await cache.put(cacheRequest, response.clone());
    return response;
  } catch (error) {
    console.error('Player suggestions failed', { message: error.message });
    return Response.json(
      { error: 'Suggestions are temporarily unavailable.' },
      {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      }
    );
  }
}
