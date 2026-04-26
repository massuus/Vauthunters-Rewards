import { fetchJson, fetchWithRetry } from './fetch-utils.js';
import {
  ARMORY_API_TIMEOUT,
  ARMORY_PLAYER_SEARCH_URL,
  ISKALL_TIER_API_TIMEOUT,
  REWARDS_API_TIMEOUT,
  REWARDS_URL,
  REQUEST_HEADERS,
  TIER_API_TIMEOUT,
  TIER_LIST_URL,
  TIER_URL,
  getRewardsAuthHeaders,
} from './config.js';

const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 50;
const DEFAULT_SYNC_LIMIT = 100;
const MAX_SYNC_LIMIT = 300;
const DEFAULT_SYNC_CONCURRENCY = 6;
const MIN_SYNC_CONCURRENCY = 1;
const MAX_SYNC_CONCURRENCY = 20;
const MAX_OFFSET = 1_000_000;
const ISKALL_TIER_LIST_CACHE_TTL_MS = 60 * 60 * 1000;

const VAULT_HUNTERS_TIER_RANK = {
  'vault dweller': 1,
  'vault cheeser': 2,
  'vault goblin': 3,
  'vault champion': 4,
  'vault legend': 5,
};

const ISKALL85_TIER_RANK = {
  iron: 1,
  gold: 2,
  diamond: 3,
  'iskallium diamond': 4,
  emerald: 5,
};

let schemaReadyPromise = null;
let iskallTierListCache = {
  data: null,
  expiresAt: 0,
  inFlight: null,
};

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function uniqueSetCount(sets) {
  if (!Array.isArray(sets) || sets.length === 0) {
    return 0;
  }

  return new Set(
    sets
      .map((setName) => String(setName || '').trim())
      .filter(Boolean)
      .map((setName) => setName.toLowerCase())
  ).size;
}

function normalizeUuid(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) {
    return '';
  }

  const compact = raw.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return '';
  }

  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function normalizeName(value, fallback = 'Unknown Player') {
  const trimmed = String(value || '').trim();
  return trimmed || fallback;
}

function extractTierName(tier) {
  if (tier && typeof tier === 'object') {
    return String(tier.name || '').trim();
  }

  return String(tier || '').trim();
}

function pickBestTierName(tiers, rankMap) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return null;
  }

  let bestName = null;
  let bestRank = -1;

  tiers.forEach((tier) => {
    const name = extractTierName(tier);
    if (!name) {
      return;
    }

    const tierRank = rankMap[name.toLowerCase()] || 0;

    if (tierRank > bestRank || (bestName === null && tierRank === bestRank)) {
      bestName = name;
      bestRank = tierRank;
    }
  });

  return bestName;
}

function getLeaderboardDb(env) {
  return env?.LEADERBOARD_DB || null;
}

export function isLeaderboardEnabled(env) {
  return Boolean(getLeaderboardDb(env));
}

async function ensureLeaderboardSchema(env) {
  const db = getLeaderboardDb(env);

  if (!db) {
    throw new Error('Leaderboard DB binding is not configured.');
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const statements = [
        `
          CREATE TABLE IF NOT EXISTS leaderboard_players (
            player_uuid TEXT PRIMARY KEY,
            player_name TEXT NOT NULL,
            sets_unlocked INTEGER NOT NULL DEFAULT 0,
            vault_hunters_tier TEXT,
            iskall85_tier TEXT,
            source TEXT NOT NULL DEFAULT 'unknown',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `,
        `
          CREATE INDEX IF NOT EXISTS idx_leaderboard_sets_updated
          ON leaderboard_players (sets_unlocked DESC, updated_at DESC)
        `,
        `
          CREATE INDEX IF NOT EXISTS idx_leaderboard_name
          ON leaderboard_players (player_name)
        `,
      ];

      for (const statement of statements) {
        await db.prepare(statement).run();
      }
    })();
  }

  try {
    await schemaReadyPromise;
  } catch (error) {
    schemaReadyPromise = null;
    throw error;
  }
}

export function buildLeaderboardRecord({
  playerUUID,
  playerNickname,
  sets,
  vaultHuntersTiers,
  iskall85Tiers,
  source = 'unknown',
}) {
  const normalizedUuid = normalizeUuid(playerUUID);
  if (!normalizedUuid) {
    return null;
  }

  const setsUnlocked = uniqueSetCount(sets);
  if (setsUnlocked < 1) {
    return null;
  }

  const safeName = normalizeName(playerNickname, normalizedUuid);
  const safeSource = normalizeName(source, 'unknown').slice(0, 64);

  return {
    playerUUID: normalizedUuid,
    playerNickname: safeName,
    setsUnlocked,
    vaultHuntersTier: pickBestTierName(vaultHuntersTiers, VAULT_HUNTERS_TIER_RANK),
    iskall85Tier: pickBestTierName(iskall85Tiers, ISKALL85_TIER_RANK),
    source: safeSource,
  };
}

export async function upsertLeaderboardRecord(env, record) {
  const db = getLeaderboardDb(env);
  if (!db || !record) {
    return { updated: false, skipped: true };
  }

  await ensureLeaderboardSchema(env);

  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `
        INSERT INTO leaderboard_players (
          player_uuid,
          player_name,
          sets_unlocked,
          vault_hunters_tier,
          iskall85_tier,
          source,
          created_at,
          updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
        ON CONFLICT(player_uuid) DO UPDATE SET
          player_name = excluded.player_name,
          sets_unlocked = excluded.sets_unlocked,
          vault_hunters_tier = excluded.vault_hunters_tier,
          iskall85_tier = excluded.iskall85_tier,
          source = excluded.source,
          updated_at = excluded.updated_at
      `
    )
    .bind(
      record.playerUUID,
      record.playerNickname,
      record.setsUnlocked,
      record.vaultHuntersTier,
      record.iskall85Tier,
      record.source,
      nowIso
    )
    .run();

  return { updated: true, skipped: false };
}

export async function getLeaderboardPlacement(env, { playerUUID, playerNickname } = {}) {
  const db = getLeaderboardDb(env);
  if (!db) {
    return null;
  }

  await ensureLeaderboardSchema(env);

  const safeUuid = normalizeUuid(playerUUID);
  const safeName = normalizeName(playerNickname, '').trim();

  if (!safeUuid && !safeName) {
    return null;
  }

  const result = await db
    .prepare(
      `
        WITH ranked AS (
          SELECT
            RANK() OVER (ORDER BY sets_unlocked DESC) AS rank,
            player_uuid,
            player_name,
            sets_unlocked,
            vault_hunters_tier,
            iskall85_tier,
            updated_at
          FROM leaderboard_players
          WHERE sets_unlocked > 0
        )
        SELECT *
        FROM ranked
        WHERE player_uuid = ?1 OR LOWER(player_name) = LOWER(?2)
        LIMIT 1
      `
    )
    .bind(safeUuid || safeName || '__missing__', safeName || safeUuid || '__missing__')
    .all();

  const row = Array.isArray(result?.results) ? result.results[0] || null : null;
  if (!row) {
    return null;
  }

  return {
    rank: Math.max(1, Number(row.rank || 0)),
    playerUUID: String(row.player_uuid || ''),
    playerNickname: normalizeName(row.player_name, 'Unknown Player'),
    setsUnlocked: Number(row.sets_unlocked || 0),
  };
}

function mapLeaderboardRow(row) {
  return {
    rank: Math.max(1, Number(row?.rank || 0)),
    playerUUID: String(row?.player_uuid || ''),
    playerNickname: normalizeName(row?.player_name, 'Unknown Player'),
    setsUnlocked: Number(row?.sets_unlocked || 0),
    vaultHuntersTier: row?.vault_hunters_tier ? String(row.vault_hunters_tier) : null,
    iskall85Tier: row?.iskall85_tier ? String(row.iskall85_tier) : null,
    updatedAt: row?.updated_at ? String(row.updated_at) : null,
  };
}

function normalizeTargetPlayer(value) {
  return String(value || '').trim();
}

function getLeaderboardWindowOffset(rank, limit) {
  const safeRank = Math.max(1, Number(rank || 0));
  const safeLimit = Math.max(1, Number(limit || 0));
  const above = Math.floor((safeLimit - 1) / 2);
  return Math.max(0, safeRank - above - 1);
}

export function parseLeaderboardPageParams(
  url,
  { defaultLimit = DEFAULT_PAGE_LIMIT, maxLimit = MAX_PAGE_LIMIT } = {}
) {
  const requestedLimit = url.searchParams.get('limit');
  const requestedOffset = url.searchParams.get('offset');
  const targetPlayer = normalizeTargetPlayer(
    url.searchParams.get('player') || url.searchParams.get('leaderboard')
  );

  return {
    limit: clampInt(requestedLimit, defaultLimit, 1, maxLimit),
    offset: clampInt(requestedOffset, 0, 0, MAX_OFFSET),
    targetPlayer,
  };
}

export async function getLeaderboardPage(
  env,
  { limit = DEFAULT_PAGE_LIMIT, offset = 0, targetPlayer = '' } = {}
) {
  const db = getLeaderboardDb(env);

  if (!db) {
    throw new Error('Leaderboard DB binding is not configured.');
  }

  await ensureLeaderboardSchema(env);

  const safeLimit = clampInt(limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const safeOffset = clampInt(offset, 0, 0, MAX_OFFSET);
  const safeTargetPlayer = normalizeTargetPlayer(targetPlayer);

  let targetRow = null;

  if (safeTargetPlayer) {
    const targetResult = await db
      .prepare(
        `
          WITH ranked AS (
            SELECT
              RANK() OVER (ORDER BY sets_unlocked DESC) AS rank,
              player_uuid,
              player_name,
              sets_unlocked,
              vault_hunters_tier,
              iskall85_tier,
              updated_at
            FROM leaderboard_players
            WHERE sets_unlocked > 0
          )
          SELECT *
          FROM ranked
          WHERE player_uuid = ?1 OR LOWER(player_name) = LOWER(?2)
          LIMIT 1
        `
      )
      .bind(safeTargetPlayer, safeTargetPlayer)
      .all();

    targetRow = Array.isArray(targetResult?.results) ? targetResult.results[0] || null : null;
  }

  const resolvedLimit = targetRow
    ? Math.max(5, Math.min(MAX_PAGE_LIMIT, safeLimit || 11))
    : safeLimit;
  const resolvedOffset = targetRow
    ? getLeaderboardWindowOffset(targetRow.rank, resolvedLimit)
    : safeOffset;

  const [totalRow, pageResult] = await Promise.all([
    db.prepare('SELECT COUNT(1) AS total FROM leaderboard_players WHERE sets_unlocked > 0').first(),
    db
      .prepare(
        `
          SELECT
            RANK() OVER (ORDER BY sets_unlocked DESC) AS rank,
            player_uuid,
            player_name,
            sets_unlocked,
            vault_hunters_tier,
            iskall85_tier,
            updated_at
          FROM leaderboard_players
          WHERE sets_unlocked > 0
          ORDER BY sets_unlocked DESC, updated_at DESC, player_name COLLATE NOCASE ASC
          LIMIT ?1 OFFSET ?2
        `
      )
      .bind(resolvedLimit, resolvedOffset)
      .all(),
  ]);

  const total = Number(totalRow?.total || 0);
  const rows = Array.isArray(pageResult?.results) ? pageResult.results : [];
  const players = rows.map(mapLeaderboardRow);
  const nextOffset = resolvedOffset + players.length;
  const focusPlayer = targetRow
    ? {
        rank: Math.max(1, Number(targetRow.rank || 0)),
        playerUUID: String(targetRow.player_uuid || ''),
        playerNickname: normalizeName(targetRow.player_name, 'Unknown Player'),
        setsUnlocked: Number(targetRow.sets_unlocked || 0),
      }
    : null;

  return {
    total,
    limit: resolvedLimit,
    offset: resolvedOffset,
    nextOffset,
    hasMore: nextOffset < total,
    players,
    focusPlayer,
  };
}

async function fetchArmoryPlayers({ limit, offset }) {
  const response = await fetchWithRetry(
    ARMORY_PLAYER_SEARCH_URL,
    {
      method: 'POST',
      headers: {
        ...REQUEST_HEADERS,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        search: '',
        limit,
        offset,
        sort: {
          vaultLevel: 'desc',
        },
      }),
    },
    ARMORY_API_TIMEOUT
  );

  if (!response.ok) {
    const error = new Error(`Armory player search failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.results)
        ? payload.results
        : [];

  return list
    .map((player) => ({
      playerUUID: normalizeUuid(player?.playerUUID),
      playerNickname: normalizeName(player?.playerNickname, ''),
    }))
    .filter((player) => player.playerUUID && player.playerNickname);
}

async function fetchRewardsSets(formattedId, headers) {
  const result = await fetchJson(
    `${REWARDS_URL}${encodeURIComponent(formattedId)}`,
    'Rewards API',
    REWARDS_API_TIMEOUT,
    headers
  );

  if (result.notFound) {
    return [];
  }

  if (result.error || !result.data) {
    const err = new Error(result.message || 'Rewards API failed');
    err.status = 502;
    err.details = { timeout: result.isTimeout, status: result.status };
    throw err;
  }

  const sets = Array.isArray(result.data?.sets) ? result.data.sets : [];
  return sets.map((setName) => String(setName || '').trim()).filter(Boolean);
}

async function fetchVaultHuntersTiers(formattedId) {
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

  return Array.isArray(result.data?.tier) ? result.data.tier : [];
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

function findIskall85TierForNickname(tierList, playerNickname) {
  const target = String(playerNickname || '')
    .trim()
    .toLowerCase();

  if (!target || !tierList || typeof tierList !== 'object') {
    return null;
  }

  const matched = Object.entries(tierList).find(
    ([name]) =>
      String(name || '')
        .trim()
        .toLowerCase() === target
  );

  const tierName = matched?.[1]?.iskall85;
  if (typeof tierName !== 'string') {
    return null;
  }

  const cleaned = tierName.trim();
  return cleaned || null;
}

async function processWithConcurrency(items, concurrency, handler) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  let cursor = 0;
  const workerCount = Math.min(items.length, Math.max(concurrency, 1));

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await handler(items[index], index);
    }
  });

  await Promise.all(workers);
}

export async function syncArmoryBatch(
  env,
  { offset = 0, limit = DEFAULT_SYNC_LIMIT, concurrency = DEFAULT_SYNC_CONCURRENCY, source } = {}
) {
  const db = getLeaderboardDb(env);

  if (!db) {
    throw new Error('Leaderboard DB binding is not configured.');
  }

  await ensureLeaderboardSchema(env);

  const safeOffset = clampInt(offset, 0, 0, MAX_OFFSET);
  const safeLimit = clampInt(limit, DEFAULT_SYNC_LIMIT, 1, MAX_SYNC_LIMIT);
  const safeConcurrency = clampInt(
    concurrency,
    DEFAULT_SYNC_CONCURRENCY,
    MIN_SYNC_CONCURRENCY,
    MAX_SYNC_CONCURRENCY
  );

  const startedAt = Date.now();
  const players = await fetchArmoryPlayers({ limit: safeLimit, offset: safeOffset });

  if (!players.length) {
    return {
      offset: safeOffset,
      limit: safeLimit,
      nextOffset: safeOffset,
      hasMore: false,
      fetchedPlayers: 0,
      upserted: 0,
      skippedNoUnlocks: 0,
      failed: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  const rewardsHeaders = getRewardsAuthHeaders(env);
  const iskallTierList = await fetchIskall85TierList();

  const stats = {
    offset: safeOffset,
    limit: safeLimit,
    nextOffset: safeOffset + players.length,
    hasMore: players.length === safeLimit,
    fetchedPlayers: players.length,
    upserted: 0,
    skippedNoUnlocks: 0,
    failed: 0,
    failedPlayers: [],
    durationMs: 0,
  };

  const sourceLabel = normalizeName(source, 'armory-sync').slice(0, 64);

  await processWithConcurrency(players, safeConcurrency, async (player) => {
    try {
      const sets = await fetchRewardsSets(player.playerUUID, rewardsHeaders);
      if (uniqueSetCount(sets) < 1) {
        stats.skippedNoUnlocks += 1;
        return;
      }

      const vaultHuntersTiers = await fetchVaultHuntersTiers(player.playerUUID);
      const iskallTierName = findIskall85TierForNickname(iskallTierList, player.playerNickname);

      const record = buildLeaderboardRecord({
        playerUUID: player.playerUUID,
        playerNickname: player.playerNickname,
        sets,
        vaultHuntersTiers,
        iskall85Tiers: iskallTierName ? [{ name: iskallTierName }] : [],
        source: sourceLabel,
      });

      if (!record) {
        stats.skippedNoUnlocks += 1;
        return;
      }

      await upsertLeaderboardRecord(env, record);
      stats.upserted += 1;
    } catch (error) {
      stats.failed += 1;
      if (stats.failedPlayers.length < 10) {
        stats.failedPlayers.push({
          playerNickname: player.playerNickname,
          playerUUID: player.playerUUID,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  stats.durationMs = Date.now() - startedAt;
  return stats;
}
