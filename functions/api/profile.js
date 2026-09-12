import { fetchJson } from '../utils/fetch-utils.js';
import { apiRateLimiter, getRateLimitKey, rateLimitResponse } from '../utils/rate-limiter.js';
import {
  buildLeaderboardRecord,
  getLeaderboardPlacement,
  upsertLeaderboardRecord,
} from '../utils/leaderboard.js';
import {
  getCompanionPlayerStats,
  updateCompanionMinecraftIdentity,
} from '../utils/companion-leaderboard.js';
import { getSnapshotProfileData } from '../utils/leaderboard-snapshots.js';
import {
  PLAYERDB_PROFILE_URL,
  REWARDS_URL,
  REWARDS_TWITCH_URL,
  TIER_URL,
  TIER_LIST_URL,
  UUID_HEX_LENGTH,
  REQUEST_HEADERS,
  PROFILE_API_TIMEOUT,
  REWARDS_API_TIMEOUT,
  TIER_API_TIMEOUT,
  ISKALL_TIER_API_TIMEOUT,
  getRewardsAuthHeaders,
} from '../utils/config.js';

const USERNAME_REGEX = /^[A-Za-z0-9_]{3,16}$/;
const TWITCH_USERNAME_REGEX = /^[A-Za-z0-9_]{1,25}$/;
const ISKALL_TIER_ORDER = ['Iron', 'Gold', 'Diamond', 'Iskallium Diamond', 'Emerald'];
const ISKALL_TIER_LIST_CACHE_TTL_MS = 60 * 60 * 1000;
const PROFILE_OVERRIDES = {
  duckfromhell: {
    rewardKeys: ['duckfromhell_tribute_1', 'duckfromhell_tribute_2'],
    priorityKeys: ['duckfromhell_tribute_1', 'duckfromhell_tribute_2', 'dylan_vip'],
  },
  kingodogo: {
    rewardKeys: ['kingodogo_tribute'],
    priorityKeys: ['kingodogo_tribute', 'dylan_vip'],
  },
};
const SET_ALIASES = {
  i85_server_bingo: 'i85_server_bingos',
  i85_servers_bingo: 'i85_server_bingos',
};
const PROFILE_BROWSER_CACHE_TTL_SECONDS = 30;
const PROFILE_EDGE_CACHE_TTL_SECONDS = 120;
const D1_READ_RETRY_DELAY_MS = 5 * 60 * 1000;

let setArtKeyCache = {
  data: null,
  expiresAt: 0,
  inFlight: null,
};

let iskallTierListCache = {
  data: null,
  expiresAt: 0,
  inFlight: null,
};
let d1ReadsUnavailableUntil = 0;

function badRequest(message) {
  return json({ error: message }, 400);
}

function getDefaultCache() {
  try {
    return caches.default;
  } catch {
    return null;
  }
}

export async function onRequest({ request, env, waitUntil }) {
  // Apply rate limiting
  const rateLimitKey = getRateLimitKey(request);
  if (!apiRateLimiter.allow(rateLimitKey)) {
    const info = apiRateLimiter.getInfo(rateLimitKey);
    return rateLimitResponse(info);
  }

  const url = new URL(request.url);
  const username = (url.searchParams.get('username') || '').trim();
  const twitchUsername = (url.searchParams.get('twitchUsername') || '').trim();

  if (!username && !twitchUsername) {
    return badRequest('A Minecraft or Twitch username is required.');
  }

  const normalizedUsername = username.toLowerCase();
  const normalizedTwitchUsername = twitchUsername.toLowerCase();

  if (username && !USERNAME_REGEX.test(normalizedUsername)) {
    return badRequest('Invalid Minecraft username. Use 3-16 letters, numbers, or underscores.');
  }
  if (twitchUsername && !TWITCH_USERNAME_REGEX.test(normalizedTwitchUsername)) {
    return badRequest('Invalid Twitch username.');
  }

  const useProfileCache = !url.searchParams.has('mock');
  const cache = getDefaultCache();
  const cacheUrl = new URL('/api/profile', url.origin);
  if (normalizedUsername) cacheUrl.searchParams.set('username', normalizedUsername);
  if (normalizedTwitchUsername)
    cacheUrl.searchParams.set('twitchUsername', normalizedTwitchUsername);
  const cacheRequest = new Request(cacheUrl, { method: 'GET' });
  if (useProfileCache && cache) {
    const cached = await cache.match(cacheRequest);
    if (cached) return cached;
  }

  const requestedProfileOverride = getProfileOverride(normalizedUsername);

  // Simple mock mode to aid local testing: /api/profile?username=...&mock=1
  if (url.searchParams.has('mock')) {
    const mockName = username || twitchUsername || 'Mock User';
    return json({
      id: 'mock',
      name: mockName,
      head: 'https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf',
      rewards: {},
      sets: requestedProfileOverride
        ? prioritizeSets(
            ['dylan_vip', ...requestedProfileOverride.rewardKeys],
            requestedProfileOverride.priorityKeys
          )
        : ['dylan_vip'],
      tier: [],
      iskall85Tier: [],
      companionStats: [
        {
          streamer: 'iskall85',
          twitchName: String(twitchUsername || '').toLowerCase() || null,
          alias: null,
          seasonLevel: 53,
          vaultsJoined: 7,
          updatedAt: null,
        },
      ],
    });
  }

  try {
    const rewardsHeaders = getRewardsAuthHeaders(env);
    const linkedRewards = normalizedTwitchUsername
      ? await fetchRewardsByTwitch(normalizedTwitchUsername, rewardsHeaders)
      : null;
    if (linkedRewards && !linkedRewards.minecraftId) {
      const [iskall85Tier, snapshotProfile] = await Promise.all([
        fetchIskall85Tiers('', '', normalizedTwitchUsername),
        env.LEADERBOARD_SNAPSHOTS
          ? getSnapshotProfileData(env, { twitchName: normalizedTwitchUsername }, url.origin).catch(
              () => ({ companionStats: [] })
            )
          : getOptionalCompanionStats(env, { twitchName: normalizedTwitchUsername }).then(
              (companionStats) => ({ companionStats })
            ),
      ]);
      const response = json(
        {
          id: null,
          name: normalizedTwitchUsername,
          twitchUsername: normalizedTwitchUsername,
          minecraftLinked: false,
          head: '/img/reward.png',
          ...normalizeRewardsPayload(linkedRewards),
          tier: [],
          iskall85Tier,
          leaderboardPlace: null,
          companionStats: snapshotProfile.companionStats,
        },
        200,
        {
          'cache-control': `public, max-age=${PROFILE_BROWSER_CACHE_TTL_SECONDS}, s-maxage=${PROFILE_EDGE_CACHE_TTL_SECONDS}`,
        }
      );
      if (useProfileCache && cache) await cache.put(cacheRequest, response.clone());
      return response;
    }
    const profile = await fetchProfile(linkedRewards?.minecraftId || normalizedUsername);

    if (!profile) {
      return json(
        {
          error: normalizedTwitchUsername
            ? 'This Twitch account is not linked to a resolvable Minecraft account.'
            : 'Player not found.',
        },
        404
      );
    }

    const { rawId, name, head } = profile;
    const formattedId = formatUuid(rawId);

    if (!rawId || !formattedId) {
      return json({ error: 'Unable to resolve player UUID.' }, 502);
    }

    const [rewardsData, tier, iskall85Tier] = await Promise.all([
      linkedRewards
        ? normalizeRewardsPayload(linkedRewards)
        : fetchRewards(formattedId, rewardsHeaders),
      fetchTiers(formattedId),
      fetchIskall85Tiers(name, normalizedUsername, normalizedTwitchUsername),
    ]);

    const profileOverride = getProfileOverride(name) || requestedProfileOverride;
    const allSetKeys = profileOverride ? await fetchAllSetKeys(request) : [];
    const { rewards, sets } = rewardsData;
    const unlockedSets = profileOverride
      ? prioritizeSets(
          mergeUniqueSets(sets, allSetKeys, ...profileOverride.rewardKeys),
          profileOverride.priorityKeys
        )
      : sets;

    await syncLeaderboardEntry({
      env,
      waitUntil,
      playerUUID: formattedId,
      playerNickname: name,
      sets: unlockedSets,
      tier,
      iskall85Tier,
    });

    if (normalizedTwitchUsername) {
      await updateCompanionMinecraftIdentity(env, {
        twitchName: normalizedTwitchUsername,
        minecraftUUID: formattedId,
        minecraftName: name,
      }).catch((error) => {
        console.error('Companion identity sync error', {
          twitchUsername: normalizedTwitchUsername,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    const usesSnapshots = Boolean(env.LEADERBOARD_SNAPSHOTS);
    const snapshotProfile = usesSnapshots
      ? await getSnapshotProfileData(
          env,
          {
            minecraftUUID: formattedId,
            minecraftName: name,
            twitchName: normalizedTwitchUsername,
          },
          url.origin
        ).catch((error) => {
          console.error('Snapshot profile data unavailable', {
            message: error instanceof Error ? error.message : String(error),
          });
          return { leaderboardPlace: null, companionStats: [] };
        })
      : null;
    const leaderboardPlace = usesSnapshots
      ? snapshotProfile.leaderboardPlace
      : await getOptionalLeaderboardPlacement(env, {
          playerUUID: formattedId,
          playerNickname: name,
        });
    const companionStats = usesSnapshots
      ? snapshotProfile.companionStats
      : await getOptionalCompanionStats(env, {
          minecraftUUID: formattedId,
          twitchName: normalizedTwitchUsername,
        });

    const response = json(
      {
        id: rawId,
        minecraftLinked: true,
        name,
        head,
        rewards,
        sets: unlockedSets,
        tier,
        iskall85Tier,
        leaderboardPlace,
        twitchUsername: normalizedTwitchUsername || undefined,
        companionStats,
      },
      200,
      {
        'cache-control': `public, max-age=${PROFILE_BROWSER_CACHE_TTL_SECONDS}, s-maxage=${PROFILE_EDGE_CACHE_TTL_SECONDS}`,
      }
    );
    if (useProfileCache && cache) {
      await cache.put(cacheRequest, response.clone());
    }
    return response;
  } catch (error) {
    console.error('Profile lookup error', {
      username: normalizedTwitchUsername || normalizedUsername,
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

export function isTributeProfile(username) {
  return Boolean(getProfileOverride(username));
}

export function getProfileOverride(username) {
  const key = String(username || '')
    .trim()
    .toLowerCase();
  return PROFILE_OVERRIDES[key] || null;
}

async function fetchAllSetKeys(request) {
  const now = Date.now();

  if (setArtKeyCache.data && now < setArtKeyCache.expiresAt) {
    return setArtKeyCache.data;
  }

  if (setArtKeyCache.inFlight) {
    return setArtKeyCache.inFlight;
  }

  const setArtUrl = new URL('/data/set-art.json', request.url);
  setArtKeyCache.inFlight = fetch(setArtUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Set art load failed: ${response.status}`);
      }

      return response.json();
    })
    .then((data) => (data && typeof data === 'object' ? Object.keys(data).filter(Boolean) : []))
    .catch((error) => {
      console.error('Failed to load set art keys for tribute profile', {
        message: error instanceof Error ? error.message : String(error),
      });
      return [];
    });

  const data = await setArtKeyCache.inFlight;
  setArtKeyCache = {
    data,
    expiresAt: Date.now() + ISKALL_TIER_LIST_CACHE_TTL_MS,
    inFlight: null,
  };
  return data;
}

export function mergeUniqueSets(primarySets, secondarySets, extraSet) {
  return Array.from(
    new Set(
      [
        ...(Array.isArray(primarySets) ? primarySets : []),
        ...(Array.isArray(secondarySets) ? secondarySets : []),
        extraSet,
      ].filter(Boolean)
    )
  );
}

export function prioritizeSets(sets, priorityKeys) {
  const uniqueSets = Array.from(new Set(Array.isArray(sets) ? sets.filter(Boolean) : []));
  const priority = Array.isArray(priorityKeys) ? priorityKeys.filter(Boolean) : [];
  const orderedPriority = priority.filter((key) => uniqueSets.includes(key));
  const remaining = uniqueSets.filter((key) => !priority.includes(key));

  return [...orderedPriority, ...remaining];
}

async function fetchRewards(formattedId, headers) {
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

async function fetchRewardsByTwitch(twitchUsername, headers) {
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

function normalizeRewardsPayload(data) {
  const rewards = Array.isArray(data.rewards) ? {} : data.rewards || {};
  const sets = normalizeSets(Array.isArray(data.sets) ? data.sets : data.sets || []);

  return { rewards, sets };
}

function normalizeSetKey(setName) {
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

async function fetchIskall85Tiers(...candidateUsernames) {
  const tierList = await fetchIskall85TierList();
  const userEntry = findTierListEntry(tierList, candidateUsernames);
  const highestTier = typeof userEntry?.iskall85 === 'string' ? userEntry.iskall85.trim() : '';

  return expandTierProgression(highestTier);
}

async function fetchIskall85TierList() {
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

function findTierListEntry(data, candidateUsernames) {
  const candidateSet = new Set(
    candidateUsernames
      .map((value) =>
        String(value || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );

  if (!candidateSet.size) {
    return null;
  }

  return (
    Object.entries(data).find(([key]) =>
      candidateSet.has(
        String(key || '')
          .trim()
          .toLowerCase()
      )
    )?.[1] || null
  );
}

function expandTierProgression(highestTier) {
  const tierIndex = ISKALL_TIER_ORDER.findIndex(
    (tier) => tier.toLowerCase() === String(highestTier || '').toLowerCase()
  );

  if (tierIndex === -1) {
    return [];
  }

  return ISKALL_TIER_ORDER.slice(0, tierIndex + 1).map((name) => ({
    name,
  }));
}

async function syncLeaderboardEntry({
  env,
  waitUntil,
  playerUUID,
  playerNickname,
  sets,
  tier,
  iskall85Tier,
}) {
  if (!env?.LEADERBOARD_DB) {
    return;
  }

  const record = buildLeaderboardRecord({
    playerUUID,
    playerNickname,
    sets,
    vaultHuntersTiers: tier,
    iskall85Tiers: iskall85Tier,
    source: 'profile-search',
  });

  if (!record) {
    return;
  }

  const writePromise = upsertLeaderboardRecord(env, record).catch((error) => {
    console.error('Leaderboard profile sync error', {
      playerUUID,
      playerNickname,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  if (typeof waitUntil === 'function') {
    waitUntil(writePromise);
  }

  return writePromise;
}

function canReadD1() {
  return Date.now() >= d1ReadsUnavailableUntil;
}

function markD1ReadUnavailable(error, context) {
  d1ReadsUnavailableUntil = Date.now() + D1_READ_RETRY_DELAY_MS;
  console.error(context, {
    message: error instanceof Error ? error.message : String(error),
  });
}

async function getOptionalLeaderboardPlacement(env, params) {
  if (!canReadD1()) return null;

  try {
    return await getLeaderboardPlacement(env, params);
  } catch (error) {
    markD1ReadUnavailable(error, 'Leaderboard placement unavailable');
    return null;
  }
}

async function getOptionalCompanionStats(env, params) {
  if (!canReadD1()) return [];

  try {
    return await getCompanionPlayerStats(env, params);
  } catch (error) {
    markD1ReadUnavailable(error, 'Companion profile stats unavailable');
    return [];
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
