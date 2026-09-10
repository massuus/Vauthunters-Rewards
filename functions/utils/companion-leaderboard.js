import { ApiError } from './http.js';
import { fetchJson } from './fetch-utils.js';
import {
  PLAYERDB_PROFILE_URL,
  PROFILE_API_TIMEOUT,
  REWARDS_API_TIMEOUT,
  REWARDS_TWITCH_URL,
  getRewardsAuthHeaders,
} from './config.js';

const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 50;
const MAX_OFFSET = 1_000_000;
const MAX_IMPORT_PLAYERS = 100;
const MAX_STAT_VALUE = 1_000_000;
export const MAX_COMPANION_IDENTITY_LOOKUPS = 5;

const METRICS = {
  seasonLevel: {
    column: 'season_level',
    secondaryColumn: 'vaults_joined',
  },
  vaultsJoined: {
    column: 'vaults_joined',
    secondaryColumn: 'season_level',
  },
};

let schemaReadyPromise = null;

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeStreamer(value, fallback = '') {
  const streamer = String(value || fallback)
    .trim()
    .toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(streamer) ? streamer : '';
}

function normalizeTwitchName(value) {
  const name = String(value || '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(name) ? name : '';
}

function normalizeMinecraftName(value) {
  const name = String(value || '').trim();
  return /^[a-zA-Z0-9_]{1,16}$/.test(name) ? name : '';
}

function normalizeAlias(value) {
  const alias = String(value || '').trim();
  return alias ? alias.slice(0, 64) : null;
}

function normalizeMetric(value) {
  return Object.hasOwn(METRICS, value) ? value : 'seasonLevel';
}

function requireDb(env) {
  const db = env?.LEADERBOARD_DB || null;
  if (!db) throw new ApiError(503, 'The companion leaderboard is not configured yet.');
  return db;
}

export function normalizeCompanionPlayer(player) {
  const playerName = normalizeMinecraftName(player?.skin ?? player?.playerName);
  const twitchName =
    normalizeTwitchName(player?.name ?? player?.twitchName) || playerName.toLowerCase();

  if (!playerName || !twitchName) return null;

  return {
    twitchName,
    playerName,
    alias: normalizeAlias(player?.alias),
    seasonLevel: clampInt(player?.seasonLevel, 0, 0, MAX_STAT_VALUE),
    vaultsJoined: clampInt(player?.vaultsJoined, 0, 0, MAX_STAT_VALUE),
  };
}

export function parseCompanionLeaderboardParams(url, options = {}) {
  const streamer = normalizeStreamer(
    url.searchParams.get('streamer'),
    options.defaultStreamer || 'iskall85'
  );
  if (!streamer) throw new ApiError(400, 'Streamer must be a valid Twitch login.');

  return {
    streamer,
    metric: normalizeMetric(url.searchParams.get('metric')),
    limit: clampInt(
      url.searchParams.get('limit'),
      options.defaultLimit || DEFAULT_PAGE_LIMIT,
      1,
      options.maxLimit || MAX_PAGE_LIMIT
    ),
    offset: clampInt(url.searchParams.get('offset'), 0, 0, MAX_OFFSET),
    targetPlayer: String(url.searchParams.get('player') || '')
      .trim()
      .slice(0, 64),
  };
}

export async function ensureCompanionLeaderboardSchema(env) {
  const db = requireDb(env);
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const statements = [
        `CREATE TABLE IF NOT EXISTS companion_leaderboard_players (
          streamer_login TEXT NOT NULL,
          twitch_name TEXT NOT NULL,
          player_name TEXT NOT NULL,
          alias TEXT,
          season_level INTEGER NOT NULL DEFAULT 0,
          vaults_joined INTEGER NOT NULL DEFAULT 0,
          minecraft_uuid TEXT,
          minecraft_name TEXT,
          source TEXT NOT NULL DEFAULT 'unknown',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (streamer_login, twitch_name)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_season
          ON companion_leaderboard_players (streamer_login, season_level DESC, vaults_joined DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_vaults
          ON companion_leaderboard_players (streamer_login, vaults_joined DESC, season_level DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_player
          ON companion_leaderboard_players (streamer_login, player_name COLLATE NOCASE)`,
        `CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_minecraft_uuid
          ON companion_leaderboard_players (minecraft_uuid)`,
        `CREATE INDEX IF NOT EXISTS idx_companion_leaderboard_twitch_name
          ON companion_leaderboard_players (twitch_name)`,
      ];

      for (const statement of statements) await db.prepare(statement).run();
    })();
  }

  try {
    await schemaReadyPromise;
  } catch (error) {
    schemaReadyPromise = null;
    throw error;
  }
}

function mapRow(row) {
  return {
    rank: Math.max(1, Number(row?.rank || 1)),
    twitchName: String(row?.twitch_name || ''),
    playerNickname: String(row?.alias || row?.twitch_name || 'Unknown Player'),
    alias: row?.alias ? String(row.alias) : null,
    skinName: String(row?.player_name || ''),
    minecraftUUID: row?.minecraft_uuid ? String(row.minecraft_uuid) : null,
    minecraftName: row?.minecraft_name ? String(row.minecraft_name) : null,
    seasonLevel: Math.max(0, Number(row?.season_level || 0)),
    vaultsJoined: Math.max(0, Number(row?.vaults_joined || 0)),
    updatedAt: row?.updated_at ? String(row.updated_at) : null,
  };
}

function getWindowOffset(rank, limit) {
  const above = Math.floor((Math.max(1, limit) - 1) / 2);
  return Math.max(0, Math.max(1, Number(rank || 1)) - above - 1);
}

export async function getCompanionLeaderboardPage(env, params) {
  const db = requireDb(env);
  await ensureCompanionLeaderboardSchema(env);

  const streamer = normalizeStreamer(params?.streamer, 'iskall85');
  if (!streamer) throw new ApiError(400, 'Streamer must be a valid Twitch login.');

  const metric = normalizeMetric(params?.metric);
  const { column, secondaryColumn } = METRICS[metric];
  const limit = clampInt(params?.limit, DEFAULT_PAGE_LIMIT, 1, MAX_PAGE_LIMIT);
  const offset = clampInt(params?.offset, 0, 0, MAX_OFFSET);
  const targetPlayer = String(params?.targetPlayer || '')
    .trim()
    .slice(0, 64);
  let targetRow = null;

  if (targetPlayer) {
    targetRow = await db
      .prepare(
        `SELECT
           target.*,
           1 + (
             SELECT COUNT(1)
             FROM companion_leaderboard_players AS higher
             WHERE higher.streamer_login = target.streamer_login
               AND higher.${column} > target.${column}
           ) AS rank
         FROM companion_leaderboard_players AS target
         WHERE target.streamer_login = ?1
           AND (LOWER(target.twitch_name) = LOWER(?2)
             OR LOWER(target.player_name) = LOWER(?2)
             OR LOWER(COALESCE(target.minecraft_name, '')) = LOWER(?2)
             OR LOWER(COALESCE(target.alias, '')) = LOWER(?2))
         LIMIT 1`
      )
      .bind(streamer, targetPlayer)
      .first();
  }

  const resolvedOffset = targetRow ? getWindowOffset(targetRow.rank, limit) : offset;
  const [totalRow, result, streamersResult] = await db.batch([
    db
      .prepare(
        'SELECT COUNT(1) AS total FROM companion_leaderboard_players WHERE streamer_login = ?'
      )
      .bind(streamer),
    db
      .prepare(
        `SELECT
          player.twitch_name, player.player_name, player.alias,
          player.minecraft_uuid, player.minecraft_name,
          player.season_level, player.vaults_joined, player.updated_at,
          1 + (
            SELECT COUNT(1)
            FROM companion_leaderboard_players AS higher
            WHERE higher.streamer_login = player.streamer_login
              AND higher.${column} > player.${column}
          ) AS rank
        FROM companion_leaderboard_players AS player
        WHERE player.streamer_login = ?1
        ORDER BY player.${column} DESC, player.${secondaryColumn} DESC,
          COALESCE(player.alias, player.twitch_name) COLLATE NOCASE ASC
        LIMIT ?2 OFFSET ?3`
      )
      .bind(streamer, limit, resolvedOffset),
    db.prepare(
      `SELECT streamer_login, COUNT(1) AS player_count, MAX(updated_at) AS updated_at
       FROM companion_leaderboard_players
       GROUP BY streamer_login
       ORDER BY streamer_login COLLATE NOCASE ASC`
    ),
  ]);

  const total = Number(totalRow?.results?.[0]?.total || 0);
  const players = (result?.results || []).map(mapRow);
  const nextOffset = resolvedOffset + players.length;

  return {
    metric,
    streamer,
    total,
    limit,
    offset: resolvedOffset,
    nextOffset,
    hasMore: nextOffset < total,
    players,
    focusPlayer: targetRow ? mapRow(targetRow) : null,
    streamers: (streamersResult?.results || []).map((row) => ({
      login: String(row.streamer_login || ''),
      playerCount: Math.max(0, Number(row.player_count || 0)),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    })),
  };
}

function normalizeUuid(value) {
  const compact = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '');
  if (!/^[0-9a-f]{32}$/.test(compact)) return '';
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

export async function getCompanionPlayerStats(
  env,
  { minecraftUUID: uuidValue, twitchName: twitchValue = '' } = {}
) {
  const minecraftUUID = normalizeUuid(uuidValue);
  const twitchName = normalizeTwitchName(twitchValue);
  if (!minecraftUUID && !twitchName) return [];
  if (!env?.LEADERBOARD_DB) return [];

  const db = requireDb(env);
  await ensureCompanionLeaderboardSchema(env);
  const result = await db
    .prepare(
      `SELECT streamer_login, twitch_name, alias, season_level, vaults_joined, updated_at
       FROM companion_leaderboard_players
       WHERE (?1 <> '' AND minecraft_uuid = ?1)
          OR (?2 <> '' AND twitch_name = ?2)
       ORDER BY streamer_login COLLATE NOCASE ASC,
         CASE WHEN twitch_name = ?2 THEN 0 ELSE 1 END ASC,
         updated_at DESC`
    )
    .bind(minecraftUUID, twitchName)
    .all();

  const byStreamer = new Map();
  for (const row of result?.results || []) {
    const streamer = normalizeStreamer(row?.streamer_login);
    if (!streamer || byStreamer.has(streamer)) continue;
    byStreamer.set(streamer, {
      streamer,
      twitchName: normalizeTwitchName(row?.twitch_name) || null,
      alias: normalizeAlias(row?.alias),
      seasonLevel: Math.max(0, Number(row?.season_level || 0)),
      vaultsJoined: Math.max(0, Number(row?.vaults_joined || 0)),
      updatedAt: row?.updated_at ? String(row.updated_at) : null,
    });
  }

  return [...byStreamer.values()];
}

export async function updateCompanionMinecraftIdentity(
  env,
  { twitchName: twitchValue, minecraftUUID: uuidValue, minecraftName: nameValue }
) {
  const twitchName = normalizeTwitchName(twitchValue);
  const minecraftUUID = normalizeUuid(uuidValue);
  const minecraftName = normalizeMinecraftName(nameValue);
  if (!twitchName || !minecraftUUID || !minecraftName) return { updated: false };

  const db = requireDb(env);
  await ensureCompanionLeaderboardSchema(env);
  const result = await db
    .prepare(
      `UPDATE companion_leaderboard_players
       SET minecraft_uuid = ?1, minecraft_name = ?2, updated_at = ?3
       WHERE twitch_name = ?4`
    )
    .bind(minecraftUUID, minecraftName, new Date().toISOString(), twitchName)
    .run();

  return { updated: Number(result?.meta?.changes || 0) > 0 };
}

async function getStoredMinecraftIdentities(env, twitchNames) {
  if (!twitchNames.length) return new Map();

  const db = requireDb(env);
  await ensureCompanionLeaderboardSchema(env);
  const placeholders = twitchNames.map((_, index) => `?${index + 1}`).join(', ');
  const result = await db
    .prepare(
      `SELECT twitch_name, minecraft_uuid, minecraft_name
       FROM companion_leaderboard_players
       WHERE twitch_name IN (${placeholders})
         AND minecraft_uuid IS NOT NULL
         AND minecraft_name IS NOT NULL
       ORDER BY updated_at DESC`
    )
    .bind(...twitchNames)
    .all();

  const identities = new Map();
  for (const row of result?.results || []) {
    const twitchName = normalizeTwitchName(row?.twitch_name);
    const minecraftUUID = normalizeUuid(row?.minecraft_uuid);
    const minecraftName = normalizeMinecraftName(row?.minecraft_name);
    if (twitchName && minecraftUUID && minecraftName && !identities.has(twitchName)) {
      identities.set(twitchName, { minecraftUUID, minecraftName });
    }
  }
  return identities;
}

async function fetchMinecraftIdentity(env, twitchName, fetchJsonFn) {
  const rewardsResult = await fetchJsonFn(
    `${REWARDS_TWITCH_URL}${encodeURIComponent(twitchName)}`,
    'Twitch rewards API',
    REWARDS_API_TIMEOUT,
    getRewardsAuthHeaders(env) || {}
  );
  if (rewardsResult?.notFound || rewardsResult?.status === 400) return { status: 'missing' };
  if (rewardsResult?.error) return { status: 'failed' };

  const minecraftUUID = normalizeUuid(rewardsResult?.data?.minecraftId);
  if (!minecraftUUID) return { status: 'missing' };

  const profileResult = await fetchJsonFn(
    `${PLAYERDB_PROFILE_URL}${encodeURIComponent(minecraftUUID.replaceAll('-', ''))}`,
    'Minecraft profile API',
    PROFILE_API_TIMEOUT
  );
  if (profileResult?.notFound || profileResult?.status === 400) return { status: 'missing' };
  if (profileResult?.error) return { status: 'failed' };

  const player = profileResult?.data?.data?.player;
  const minecraftName = normalizeMinecraftName(player?.username);
  const profileUUID = normalizeUuid(player?.raw_id) || minecraftUUID;
  if (!minecraftName || !profileUUID) return { status: 'missing' };

  return { status: 'resolved', minecraftUUID: profileUUID, minecraftName };
}

export async function resolveCompanionMinecraftIdentities(
  env,
  { twitchNames: rawTwitchNames, fetchJsonFn = fetchJson } = {}
) {
  if (!Array.isArray(rawTwitchNames) || rawTwitchNames.length < 1) {
    throw new ApiError(400, 'Provide at least one Twitch username to resolve.');
  }
  if (rawTwitchNames.length > MAX_COMPANION_IDENTITY_LOOKUPS) {
    throw new ApiError(
      413,
      `Resolve at most ${MAX_COMPANION_IDENTITY_LOOKUPS} Twitch usernames per request.`
    );
  }

  const twitchNames = [...new Set(rawTwitchNames.map(normalizeTwitchName).filter(Boolean))];
  const skipped = rawTwitchNames.length - twitchNames.length;
  if (!twitchNames.length) throw new ApiError(400, 'None of the Twitch usernames were valid.');

  const storedIdentities = await getStoredMinecraftIdentities(env, twitchNames);
  const pendingNames = twitchNames.filter((twitchName) => !storedIdentities.has(twitchName));
  const fetched = await Promise.all(
    pendingNames.map(async (twitchName) => {
      try {
        return { twitchName, ...(await fetchMinecraftIdentity(env, twitchName, fetchJsonFn)) };
      } catch (error) {
        console.error('Companion identity lookup failed', {
          twitchName,
          message: error instanceof Error ? error.message : String(error),
        });
        return { twitchName, status: 'failed' };
      }
    })
  );

  const identities = [
    ...[...storedIdentities].map(([twitchName, identity]) => ({
      twitchName,
      status: 'existing',
      ...identity,
    })),
    ...fetched.filter((identity) => identity.status === 'resolved'),
  ];
  const storedResults = await Promise.all(
    identities.map((identity) => updateCompanionMinecraftIdentity(env, identity))
  );
  const storedCount = storedResults.filter((result) => result.updated).length;
  const existing = identities.filter((identity) => identity.status === 'existing').length;
  const resolved = identities.length - existing;

  return {
    received: rawTwitchNames.length,
    processed: twitchNames.length,
    resolved,
    existing,
    missing: fetched.filter((identity) => identity.status === 'missing').length,
    failed:
      fetched.filter((identity) => identity.status === 'failed').length +
      Math.max(0, identities.length - storedCount),
    skipped,
  };
}

export async function upsertCompanionPlayers(
  env,
  { streamer: streamerValue, players: rawPlayers, source = 'manual' }
) {
  const db = requireDb(env);
  await ensureCompanionLeaderboardSchema(env);

  const streamer = normalizeStreamer(streamerValue);
  if (!streamer) throw new ApiError(400, 'Streamer must be a valid Twitch login.');
  if (!Array.isArray(rawPlayers) || rawPlayers.length < 1) {
    throw new ApiError(400, 'Provide at least one player.');
  }
  if (rawPlayers.length > MAX_IMPORT_PLAYERS) {
    throw new ApiError(413, `Import at most ${MAX_IMPORT_PLAYERS} players per request.`);
  }

  const deduplicated = new Map();
  let skipped = 0;
  rawPlayers.forEach((rawPlayer) => {
    const player = normalizeCompanionPlayer(rawPlayer);
    if (!player) {
      skipped += 1;
      return;
    }
    deduplicated.set(player.twitchName, player);
  });

  const players = [...deduplicated.values()];
  if (!players.length)
    throw new ApiError(400, 'None of the players had a valid Minecraft skin username.');

  const now = new Date().toISOString();
  const safeSource =
    String(source || 'manual')
      .trim()
      .slice(0, 64) || 'manual';
  const statements = players.map((player) =>
    db
      .prepare(
        `INSERT INTO companion_leaderboard_players (
          streamer_login, twitch_name, player_name, alias, season_level,
          vaults_joined, source, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
        ON CONFLICT(streamer_login, twitch_name) DO UPDATE SET
          player_name = excluded.player_name,
          alias = excluded.alias,
          season_level = excluded.season_level,
          vaults_joined = excluded.vaults_joined,
          source = excluded.source,
          updated_at = excluded.updated_at`
      )
      .bind(
        streamer,
        player.twitchName,
        player.playerName,
        player.alias,
        player.seasonLevel,
        player.vaultsJoined,
        safeSource,
        now
      )
  );

  await db.batch(statements);
  return {
    streamer,
    received: rawPlayers.length,
    updated: players.length,
    skipped,
  };
}
