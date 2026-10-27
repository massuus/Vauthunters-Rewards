import { fetchJson } from '../utils/fetch-utils.js';
import { REWARDS_API_TIMEOUT, getRewardsAuthHeaders } from '../utils/config.js';

const REWARDS_SETS_URL = 'https://rewards.vaulthunters.gg/rewards/sets/all';
const SHOP_SETS_URL = 'https://ebs.vaulthunters.gg/battlepass/reward-sets';
const SETS_CACHE_TTL_SECONDS = 300;

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
    let result = await fetchJson(SHOP_SETS_URL, 'Reward Shop API', REWARDS_API_TIMEOUT);
    const shopLoaded = !result.error && Array.isArray(result.data) && result.data.length > 0;
    if (!shopLoaded) {
      result = await fetchJson(
        REWARDS_SETS_URL,
        'Rewards Sets API',
        REWARDS_API_TIMEOUT,
        getRewardsAuthHeaders(env)
      );
    }

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
        category: item?.category,
        ...(shopLoaded
          ? {
              cost: item?.cost,
              price: item?.price,
              discount: item?.discount,
              featured: item?.featured,
            }
          : {}),
      }))
      .filter((item) => typeof item.id === 'string' && item.id.length > 0);

    const ttl = shopLoaded ? SETS_CACHE_TTL_SECONDS : 60;
    const response = json(minimal, 200, {
      'cache-control': `public, max-age=${ttl}, s-maxage=${ttl}`,
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
