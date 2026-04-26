// Configuration constants for API requests

// Timeout settings
export const TIMEOUT_MS = 10000; // 10 seconds
export const PROFILE_API_TIMEOUT = 8000; // 8 seconds for profile lookup
export const REWARDS_API_TIMEOUT = 8000; // 8 seconds for rewards API
export const TIER_API_TIMEOUT = 5000; // 5 seconds for tier API
export const ISKALL_TIER_API_TIMEOUT = 5000; // 5 seconds for Iskall85 tier API
export const SERVERS_API_TIMEOUT = 5000; // 5 seconds for official servers API
export const ARMORY_API_TIMEOUT = 12000; // 12 seconds for armory search API

// Retry settings
export const MAX_RETRIES = 3;
export const INITIAL_RETRY_DELAY_MS = 1000; // 1 second
export const MAX_RETRY_DELAY_MS = 5000; // 5 seconds
export const RETRY_BACKOFF_MULTIPLIER = 2;

// Rate limiting
export const RATE_LIMIT_MAX_REQUESTS = 60;
export const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

// HTTP Status codes to retry
export const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// API URLs (keeping them here for easy configuration)
export const PLAYERDB_PROFILE_URL = 'https://playerdb.co/api/player/minecraft/';
export const REWARDS_URL = 'https://rewards.vaulthunters.gg/rewards?minecraft=';
export const TIER_URL = 'https://api.vaulthunters.gg/users/reward?uuid=';
export const TIER_LIST_URL = 'https://api.vaulthunters.gg/users/reward/list';
export const SERVERS_URL = 'https://api.vaulthunters.gg/server';
export const ARMORY_PLAYER_SEARCH_URL = 'https://api.vaulthunters.gg/armory/player/search';

// Minecraft UUID without dashes is 32 hex characters
export const UUID_HEX_LENGTH = 32;

export const REQUEST_HEADERS = {
  'user-agent': 'Vauthunters Rewards/1.0 (+https://vh-rewards.massuus.com)',
  accept: 'application/json',
};

/**
 * Build auth headers for Rewards API requests.
 * Cloudflare Pages provides secrets via env bindings; local shell env is supported as fallback.
 */
export function getRewardsAuthHeaders(env = {}) {
  const apiKey = env?.REWARDS_API_KEY || globalThis?.process?.env?.REWARDS_API_KEY;

  if (!apiKey) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
  };
}
