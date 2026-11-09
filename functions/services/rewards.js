import { fetchJson } from '../utils/fetch-utils.js';
import { REWARDS_URL, REWARDS_TWITCH_URL, REWARDS_API_TIMEOUT } from '../utils/config.js';

const SET_ALIASES = {
  i85_server_bingo: 'i85_server_bingos',
  i85_servers_bingo: 'i85_server_bingos',
};
export async function fetchRewards(formattedId, headers) {
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

  return normalizeRewardsPayload(result.data);
}

export async function fetchRewardsByTwitch(twitchUsername, headers) {
  const result = await fetchJson(
    `${REWARDS_TWITCH_URL}${encodeURIComponent(twitchUsername)}`,
    'Twitch rewards API',
    REWARDS_API_TIMEOUT,
    headers
  );

  if (result.error) {
    const error = new Error(result.message || 'Twitch rewards API failed');
    error.status = 502;
    throw error;
  }
  if (result.notFound || !result.data || typeof result.data !== 'object') {
    const error = new Error('Twitch account not found.');
    error.status = 404;
    throw error;
  }

  return result.data;
}

export function normalizeRewardsPayload(data) {
  const rewards = Array.isArray(data.rewards) ? {} : data.rewards || {};
  const sets = normalizeSets(Array.isArray(data.sets) ? data.sets : data.sets || []);

  return { rewards, sets };
}

export function normalizeSetKey(setName) {
  const key = String(setName || '')
    .trim()
    .toLowerCase();

  return SET_ALIASES[key] || key;
}

function normalizeSets(sets) {
  if (!Array.isArray(sets)) {
    return [];
  }

  return Array.from(new Set(sets.map(normalizeSetKey).filter(Boolean)));
}
