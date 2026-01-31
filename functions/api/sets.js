import { fetchJson } from '../utils/fetch-utils.js';
import { REWARDS_API_TIMEOUT } from '../utils/config.js';

const REWARDS_SETS_URL = 'https://rewards.vaulthunters.gg/rewards/sets/all';

export async function onRequest({ env }) {
  try {
    const headers = env?.REWARDS_API_KEY
      ? { Authorization: `Bearer ${env.REWARDS_API_KEY}` }
      : undefined;

    const result = await fetchJson(REWARDS_SETS_URL, 'Rewards Sets API', REWARDS_API_TIMEOUT, headers);

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

    return json(minimal);
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

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
