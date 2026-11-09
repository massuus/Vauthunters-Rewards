import { fetchJson } from '../utils/fetch-utils.js';
import {
  TIER_LIST_URL,
  ISKALL_TIER_API_TIMEOUT,
  TIER_URL,
  TIER_API_TIMEOUT,
} from '../utils/config.js';

const ISKALL_TIER_LIST_CACHE_TTL_MS = 60 * 60 * 1000;

let iskallTierListCache = {
  data: null,
  expiresAt: 0,
  inFlight: null,
};

export async function fetchIskall85TierList() {
  const now = Date.now();

  if (iskallTierListCache.data && now < iskallTierListCache.expiresAt) {
    return iskallTierListCache.data;
  }

  if (iskallTierListCache.inFlight) {
    return iskallTierListCache.inFlight;
  }

  iskallTierListCache.inFlight = loadIskall85TierList();

  try {
    const data = await iskallTierListCache.inFlight;
    iskallTierListCache = {
      data,
      expiresAt: Date.now() + ISKALL_TIER_LIST_CACHE_TTL_MS,
      inFlight: null,
    };
    return data;
  } catch (error) {
    iskallTierListCache.inFlight = null;
    throw error;
  }
}

async function loadIskall85TierList() {
  const result = await fetchJson(TIER_LIST_URL, 'Iskall85 Tier API', ISKALL_TIER_API_TIMEOUT);

  if (result.notFound) {
    return {};
  }

  if (result.error || !result.data || typeof result.data !== 'object') {
    const err = new Error(result.message || 'Iskall85 Tier API failed');
    err.status = 502;
    err.details = { timeout: result.isTimeout, status: result.status };
    throw err;
  }

  return result.data;
}

export async function fetchVaultHuntersTiers(formattedId) {
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
