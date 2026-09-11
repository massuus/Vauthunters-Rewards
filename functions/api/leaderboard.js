import { apiRateLimiter, getRateLimitKey, rateLimitResponse } from '../utils/rate-limiter.js';
import { getSnapshotLeaderboardPage } from '../utils/leaderboard-snapshots.js';
import {
  getLeaderboardPage,
  getLeaderboardTotal,
  isLeaderboardEnabled,
  parseLeaderboardPageParams,
} from '../utils/leaderboard.js';
import {
  getCompanionLeaderboardPage,
  getCompanionLeaderboardStreamers,
  parseCompanionLeaderboardParams,
} from '../utils/companion-leaderboard.js';

const BROWSER_CACHE_TTL_SECONDS = 60;
const EDGE_CACHE_TTL_SECONDS = 300;

function getDefaultCache() {
  try {
    return caches.default;
  } catch {
    return null;
  }
}

function buildCacheRequest(url, params, metric) {
  const cacheUrl = new URL('/api/leaderboard', url.origin);
  cacheUrl.searchParams.set('v', '3');
  cacheUrl.searchParams.set('metric', metric);
  cacheUrl.searchParams.set('limit', params.limit);
  cacheUrl.searchParams.set('offset', params.offset);
  if (params.streamer) cacheUrl.searchParams.set('streamer', params.streamer);
  if (params.targetPlayer) cacheUrl.searchParams.set('player', params.targetPlayer.toLowerCase());
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

export async function onRequest(context) {
  const { request, env } = context;
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

  if (!env.LEADERBOARD_SNAPSHOTS && !isLeaderboardEnabled(env)) {
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
  const standardParams = parseLeaderboardPageParams(url, {
    defaultLimit: 10,
    maxLimit: 50,
  });
  const requestedMetric = String(url.searchParams.get('metric') || 'setsUnlocked');

  try {
    const isCompanion = requestedMetric === 'seasonLevel' || requestedMetric === 'vaultsJoined';
    const params = isCompanion
      ? parseCompanionLeaderboardParams(url, { defaultLimit: 10, maxLimit: 50 })
      : standardParams;
    const cache = getDefaultCache();
    const cacheRequest = buildCacheRequest(
      url,
      params,
      isCompanion ? requestedMetric : 'setsUnlocked'
    );

    if (cache) {
      const cached = await cache.match(cacheRequest);
      if (cached) {
        return cached;
      }
    }

    const payload = env.LEADERBOARD_SNAPSHOTS
      ? await getSnapshotLeaderboardPage(
          env,
          params,
          isCompanion ? requestedMetric : 'setsUnlocked',
          url.origin
        )
      : isCompanion
        ? await getCompanionLeaderboardPage(env, params, {
            loadStreamers: () => loadStreamers(env, cache, url.origin),
          })
        : {
            ...(await getLeaderboardPage(env, standardParams, {
              loadTotal: () =>
                loadMetadata(cache, url.origin, 'unlock-total', () => getLeaderboardTotal(env)),
            })),
            metric: 'setsUnlocked',
          };

    const response = json(payload, 200, {
      'cache-control': `public, max-age=${BROWSER_CACHE_TTL_SECONDS}, s-maxage=${EDGE_CACHE_TTL_SECONDS}`,
    });

    if (cache) {
      const cachePut = cache.put(cacheRequest, response.clone()).catch((error) => {
        console.error('Leaderboard cache write failed', { message: error.message });
      });
      if (typeof context.waitUntil === 'function') {
        context.waitUntil(cachePut);
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
        error:
          error.status === 503
            ? error.message
            : 'Failed to load leaderboard right now. Please try again.',
      },
      error.status === 400 || error.status === 503 ? error.status : 500,
      { 'cache-control': 'no-store' }
    );
  }
}

async function loadStreamers(env, cache, origin) {
  return loadMetadata(cache, origin, 'streamers', () => getCompanionLeaderboardStreamers(env));
}

async function loadMetadata(cache, origin, name, load) {
  const key = new Request(new URL(`/api/leaderboard/_${name}?v=1`, origin));
  const cached = cache ? await cache.match(key) : null;
  if (cached) return cached.json();
  const metadata = await load();
  if (cache) {
    try {
      await cache.put(key, json(metadata, 200, { 'cache-control': 'public, max-age=300' }));
    } catch (error) {
      console.error('Leaderboard metadata cache write failed', { message: error.message });
    }
  }
  return metadata;
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
