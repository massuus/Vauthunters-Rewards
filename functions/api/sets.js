import { fetchJson } from '../utils/fetch-utils.js';
import { REWARDS_API_TIMEOUT, getRewardsAuthHeaders } from '../utils/config.js';

const REWARDS_SETS_URL = 'https://rewards.vaulthunters.gg/rewards/sets/all';
const SETS_CACHE_TTL_SECONDS = 3600;

function getDefaultCache() {
  try {
    return caches.default;
  } catch {
    return null;
  }
}

export async function onRequest({ request, env }) {
  const cache = getDefaultCache();
  const cacheRequest = new Request(new URL(request.url).toString(), { method: 'GET' });
  if (cache) {
    const cached = await cache.match(cacheRequest);
    if (cached) return cached;
  }

  try {
    const headers = getRewardsAuthHeaders(env);

    const result = await fetchJson(
      REWARDS_SETS_URL,
      'Rewards Sets API',
      REWARDS_API_TIMEOUT,
      headers
    );

    if (result.error || !result.data) {
      const err = new Error(result.message || 'Rewards Sets API failed');
      err.status = 502;
      err.details = { timeout: result.isTimeout, status: result.status };
      throw err;
    }

    const list = Array.isArray(result.data) ? result.data : [];
    const minimal = list
      .map((item) => ({
        id: item?.id,
        displayName: item?.displayName,
        description: item?.description,
        unavailable: item?.unavailable,
      }))
      .filter((item) => typeof item.id === 'string' && item.id.length > 0);

    const response = json(minimal, 200, {
      'cache-control': `public, max-age=${SETS_CACHE_TTL_SECONDS}, s-maxage=${SETS_CACHE_TTL_SECONDS}`,
    });
    if (cache) await cache.put(cacheRequest, response.clone());
    return response;
  } catch (error) {
    const status = typeof error?.status === 'number' ? error.status : 500;
    return json(
      {
        error:
          status >= 500
            ? 'Failed to retrieve reward sets. Please try again.'
            : error?.message || 'Request failed.',
        details: error?.details || undefined,
      },
      status
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
