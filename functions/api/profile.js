import { fetchJson } from '../utils/fetch-utils.js';
import { apiRateLimiter, getRateLimitKey, rateLimitResponse } from '../utils/rate-limiter.js';
import {
  PLAYERDB_PROFILE_URL,
  REWARDS_URL,
  TIER_URL,
  UUID_HEX_LENGTH,
  REQUEST_HEADERS,
  PROFILE_API_TIMEOUT,
  REWARDS_API_TIMEOUT,
  TIER_API_TIMEOUT,
} from '../utils/config.js';

const USERNAME_REGEX = /^[A-Za-z0-9_]{3,16}$/;

function badRequest(message) {
  return json({ error: message }, 400);
}

export async function onRequest({ request, env }) {
  // Apply rate limiting
  const rateLimitKey = getRateLimitKey(request);
  if (!apiRateLimiter.allow(rateLimitKey)) {
    const info = apiRateLimiter.getInfo(rateLimitKey);
    return rateLimitResponse(info);
  }

  const url = new URL(request.url);
  const username = (url.searchParams.get('username') || '').trim();

  if (!username) {
    return badRequest('Username query parameter is required.');
  }

  const normalizedUsername = username.toLowerCase();

  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return badRequest('Invalid Minecraft username. Use 3-16 letters, numbers, or underscores.');
  }

  // Simple mock mode to aid local testing: /api/profile?username=...&mock=1
  if (url.searchParams.has('mock')) {
    const mockName = username || 'Mock User';
    return json({
      id: 'mock',
      name: mockName,
      head: 'https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf',
      rewards: {},
      sets: ['dylan_vip'],
      tier: [],
    });
  }

  try {
    const profile = await fetchProfile(normalizedUsername);

    if (!profile) {
      return json({ error: 'Player not found.' }, 404);
    }

    const { rawId, name, head } = profile;
    const formattedId = formatUuid(rawId);

    if (!rawId || !formattedId) {
      return json({ error: 'Unable to resolve player UUID.' }, 502);
    }

    const rewardsApiKey = env?.REWARDS_API_KEY;
    const [rewardsData, tier] = await Promise.all([
      fetchRewards(formattedId, rewardsApiKey),
      fetchTiers(formattedId),
    ]);

    const { rewards, sets } = rewardsData;

    return json({
      id: rawId,
      name,
      head,
      rewards,
      sets,
      tier,
    });
  } catch (error) {
    console.error('Profile lookup error', {
      username: normalizedUsername,
      message: error instanceof Error ? error.message : String(error),
      status: error?.status,
      stack: error?.stack,
      isTimeout: error?.isTimeout,
    });
    const status = typeof error?.status === 'number' ? error.status : 500;
    return json(
      {
        error:
          status >= 500
            ? 'Failed to retrieve player data. Please try again.'
            : error?.message || 'Request failed.',
        details: error?.details || undefined,
      },
      status
    );
  }
}

async function fetchProfile(username) {
  const { fetchWithRetry } = await import('../utils/fetch-utils.js');
  const response = await fetchWithRetry(
    `${PLAYERDB_PROFILE_URL}${encodeURIComponent(username)}`,
    { headers: REQUEST_HEADERS },
    PROFILE_API_TIMEOUT
  );

  // Treat 400 and 404 as "player not found"
  if (response.status === 404 || response.status === 400) {
    return null;
  }

  if (!response.ok) {
    const err = new Error(`Profile API error: ${response.status}`);
    err.status = 502;
    throw err;
  }

  const data = await response.json();

  if (!data?.success || !data?.data?.player?.raw_id) {
    return null;
  }

  const player = data.data.player;
  const rawId = player.raw_id;

  if (typeof rawId !== 'string' || rawId.length !== UUID_HEX_LENGTH) {
    return null;
  }

  return {
    rawId,
    name: player.username || username,
    head: `https://mc-heads.net/avatar/${rawId}`,
  };
}

function formatUuid(hexId) {
  if (!hexId || hexId.length !== UUID_HEX_LENGTH) {
    return null;
  }

  return `${hexId.slice(0, 8)}-${hexId.slice(8, 12)}-${hexId.slice(12, 16)}-${hexId.slice(16, 20)}-${hexId.slice(20)}`;
}

async function fetchRewards(formattedId, rewardsApiKey) {
  const headers = rewardsApiKey ? { Authorization: `Bearer ${rewardsApiKey}` } : undefined;
  const result = await fetchJson(
    `${REWARDS_URL}${encodeURIComponent(formattedId)}`,
    'Rewards API',
    REWARDS_API_TIMEOUT,
    headers
  );

  if (result.notFound) {
    return { rewards: {}, sets: [] };
  }

  if (result.error || !result.data) {
    const err = new Error(result.message || 'Rewards API failed');
    err.status = 502;
    err.details = { timeout: result.isTimeout, status: result.status };
    throw err;
  }

  const data = result.data;
  const rewards = Array.isArray(data.rewards) ? {} : data.rewards || {};
  const sets = Array.isArray(data.sets) ? data.sets : data.sets || [];

  return { rewards, sets };
}

async function fetchTiers(formattedId) {
  const result = await fetchJson(
    `${TIER_URL}${encodeURIComponent(formattedId)}`,
    'Tier API',
    TIER_API_TIMEOUT
  );

  if (result.notFound) {
    return [];
  }

  if (result.error || !result.data) {
    const err = new Error(result.message || 'Tier API failed');
    err.status = 502;
    err.details = { timeout: result.isTimeout, status: result.status };
    throw err;
  }

  return Array.isArray(result.data.tier) ? result.data.tier : [];
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
