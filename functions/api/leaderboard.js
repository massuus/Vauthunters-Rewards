import { apiRateLimiter, getRateLimitKey, rateLimitResponse } from '../utils/rate-limiter.js';
import {
  getLeaderboardPage,
  isLeaderboardEnabled,
  parseLeaderboardPageParams,
} from '../utils/leaderboard.js';

const BROWSER_CACHE_TTL_SECONDS = 15;
const EDGE_CACHE_TTL_SECONDS = 60;

function getDefaultCache() {
  try {
    return caches.default;
  } catch {
    return null;
  }
}

function buildCacheRequest(url) {
  const cacheUrl = new URL(url.toString());
  cacheUrl.searchParams.delete('refresh');
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

export async function onRequest({ request, env, waitUntil }) {
  const rateLimitKey = getRateLimitKey(request);
  if (!apiRateLimiter.allow(rateLimitKey)) {
    const info = apiRateLimiter.getInfo(rateLimitKey);
    return rateLimitResponse(info);
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed. Use GET.' }, 405, {
      Allow: 'GET',
      'cache-control': 'no-store',
    });
  }

  if (!isLeaderboardEnabled(env)) {
    return json(
      {
        error:
          'Leaderboard is not configured yet. Add a D1 binding named LEADERBOARD_DB to enable it.',
      },
      503,
      { 'cache-control': 'no-store' }
    );
  }

  const url = new URL(request.url);
  const { limit, offset, targetPlayer } = parseLeaderboardPageParams(url, {
    defaultLimit: 10,
    maxLimit: 50,
  });

  const bypassCache =
    url.searchParams.has('refresh') ||
    String(request.headers.get('cache-control') || '')
      .toLowerCase()
      .includes('no-cache');

  const cache = getDefaultCache();
  const cacheRequest = buildCacheRequest(url);

  if (!bypassCache && cache) {
    const cached = await cache.match(cacheRequest);
    if (cached) {
      return cached;
    }
  }

  try {
    const payload = await getLeaderboardPage(env, { limit, offset, targetPlayer });

    const response = json(payload, 200, {
      'cache-control': `public, max-age=${BROWSER_CACHE_TTL_SECONDS}, s-maxage=${EDGE_CACHE_TTL_SECONDS}, stale-while-revalidate=${EDGE_CACHE_TTL_SECONDS}`,
    });

    if (!bypassCache && cache) {
      const cachePut = cache.put(cacheRequest, response.clone());
      if (typeof waitUntil === 'function') {
        waitUntil(cachePut);
      } else {
        await cachePut;
      }
    }

    return response;
  } catch (error) {
    console.error('Leaderboard query error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return json(
      {
        error: 'Failed to load leaderboard right now. Please try again.',
      },
      500,
      { 'cache-control': 'no-store' }
    );
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}
