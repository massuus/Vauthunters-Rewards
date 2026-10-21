import { ApiError } from './http.js';

export const SNAPSHOT_MANIFEST_KEY = 'leaderboards/v1/current.json';
export const SNAPSHOT_DATA_PREFIX = 'leaderboards/v1/data/';
export const SNAPSHOT_CHUNK_SIZE = 250;
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;
export const PROFILE_SHARD_COUNT = 64;

export function profileShard(identifier) {
  let hash = 2166136261;
  for (const char of String(identifier).trim().toLowerCase()) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return (hash >>> 0) % PROFILE_SHARD_COUNT;
}

async function readProfileShards(env, manifest, identifiers, origin) {
  const keys = identifiers
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
  const shards = new Map(
    await Promise.all(
      [...new Set(keys.map(profileShard))].map(async (shard) => [
        shard,
        await readObject(env, `${manifest.prefix}profiles/${shard}.json`, origin, true, false),
      ])
    )
  );
  const find = (board, candidates = keys) => {
    for (const key of candidates) {
      const data = shards.get(profileShard(key));
      if (Object.hasOwn(data, key) && Object.hasOwn(data[key], board)) return data[key][board];
    }
    return null;
  };
  // Twitch-only profiles must not acquire an unrelated Minecraft placement.
  const minecraftKeys = identifiers
    .slice(0, 2)
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
  const leaderboardPlace = find('setsUnlocked', minecraftKeys);
  const companionKeys = [identifiers[2], ...identifiers.slice(0, 2)]
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean);
  const companionStats = (manifest.streamers || [])
    .map(({ login }) => {
      const season = find(snapshotBoardKey('seasonLevel', login), companionKeys);
      const vaults = find(snapshotBoardKey('vaultsJoined', login), companionKeys);
      const player = season || vaults;
      return player
        ? {
            streamer: login,
            twitchName: player.twitchName || null,
            alias: player.alias || null,
            seasonLevel: player.seasonLevel || 0,
            seasonLevelRank: season?.rank || null,
            vaultsJoined: player.vaultsJoined || 0,
            vaultsJoinedRank: vaults?.rank || null,
            updatedAt: player.updatedAt || null,
          }
        : null;
    })
    .filter(Boolean);
  return { leaderboardPlace, companionStats };
}

export function snapshotBoardKey(metric, streamer = '') {
  return metric === 'setsUnlocked' ? metric : `${metric}/${streamer}`;
}

// This cache is shared by all page offsets and focus lookups at a data center.
// No request state or cross-request promises are kept in the isolate.
async function readObject(env, key, origin, immutable = false, useCache = true) {
  let cache;
  try {
    cache = useCache ? caches.default : null;
  } catch {
    /* Local tests have no Cache API. */
  }
  const cacheKey = new Request(new URL(`/__leaderboard_snapshot/${key}`, origin));
  const cached = cache ? await cache.match(cacheKey) : null;
  if (cached) return cached.json();
  const object = await env.LEADERBOARD_SNAPSHOTS.get(key);
  if (!object)
    throw new ApiError(503, 'Leaderboard results are being prepared. Please try again shortly.');
  if (object.size > MAX_OBJECT_BYTES)
    throw new Error('Leaderboard snapshot exceeds its size limit.');
  const data = await object.json();
  if (cache) {
    try {
      await cache.put(
        cacheKey,
        Response.json(data, {
          headers: { 'cache-control': `public, max-age=${immutable ? 3600 : 60}` },
        })
      );
    } catch (error) {
      console.error('Snapshot cache write failed', { message: error.message });
    }
  }
  return data;
}

async function readManifest(env, origin, useCache = true) {
  const manifest = await readObject(env, SNAPSHOT_MANIFEST_KEY, origin, false, useCache);
  if (manifest.schema !== 1 || !manifest.prefix?.startsWith(SNAPSHOT_DATA_PREFIX)) {
    throw new Error('Unsupported leaderboard snapshot.');
  }
  return manifest;
}

export async function getSnapshotStreamerStats(env, origin) {
  const manifest = await readManifest(env, origin);
  if (!manifest.statsKey?.startsWith(manifest.prefix))
    throw new ApiError(503, 'Streamer statistics are being prepared. Please try again shortly.');
  const stats = await readObject(env, manifest.statsKey, origin, true);
  if (stats.schema !== 1 || !stats.filters) throw new Error('Unsupported streamer statistics.');
  return stats;
}

function suggestionTerms(player) {
  return [player.name, player.minecraftName, player.twitchName, player.alias]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

export async function searchSnapshotPlayers(env, query, origin) {
  const manifest = await readManifest(env, origin);
  if (!manifest.searchKey?.startsWith(manifest.prefix)) return [];
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  const index = await readObject(env, manifest.searchKey, origin, true);
  const candidates = index
    .filter((player) => suggestionTerms(player).some((value) => value.includes(needle)))
    .sort((left, right) => {
      const score = (player) =>
        Math.min(
          ...suggestionTerms(player).map((value) =>
            value === needle ? 0 : value.startsWith(needle) ? 1 : 2
          )
        );
      return (
        score(left) - score(right) ||
        left.name.toLowerCase().localeCompare(right.name.toLowerCase())
      );
    });
  const seenNames = new Set();
  return candidates
    .filter((player) => {
      const name = player.name.toLowerCase();
      if (seenNames.has(name)) return false;
      seenNames.add(name);
      return true;
    })
    .slice(0, 6);
}

async function readPlayerAt(env, manifest, boardKey, position, origin, useCache = true) {
  if (!Number.isInteger(position) || position < 0) return null;
  const chunk = Math.floor(position / SNAPSHOT_CHUNK_SIZE);
  const rows = await readObject(
    env,
    `${manifest.prefix}${boardKey}/${chunk}.json`,
    origin,
    true,
    useCache
  );
  return rows[position % SNAPSHOT_CHUNK_SIZE] || null;
}

async function findSnapshotPlayer(env, manifest, boardKey, identifiers, origin, useCache = true) {
  if (!manifest.boards[boardKey]) return null;
  const names = await readObject(
    env,
    `${manifest.prefix}${boardKey}/names.json`,
    origin,
    true,
    useCache
  );
  for (const identifier of identifiers) {
    const key = String(identifier || '')
      .trim()
      .toLowerCase();
    if (key && Object.hasOwn(names, key)) {
      return readPlayerAt(env, manifest, boardKey, names[key], origin, useCache);
    }
  }
  return null;
}

async function findSnapshotProfilePlayer(
  env,
  manifest,
  boardKey,
  identifiers,
  origin,
  useCache = true
) {
  if (!manifest.boards[boardKey]) return null;
  if (manifest.format >= 3) {
    const names = await readObject(
      env,
      `${manifest.prefix}${boardKey}/profile-names.json`,
      origin,
      true,
      useCache
    );
    for (const identifier of identifiers) {
      const key = String(identifier || '')
        .trim()
        .toLowerCase();
      if (key && Object.hasOwn(names, key)) {
        return readPlayerAt(env, manifest, boardKey, names[key], origin, useCache);
      }
    }
    return null;
  }

  // Older snapshots included cosmetic skin selections in their general name
  // index. Validate the returned account identity so a borrowed skin cannot
  // attach another player's Twitch account to this profile.
  const player = await findSnapshotPlayer(env, manifest, boardKey, identifiers, origin, useCache);
  if (!player) return null;
  const expected = new Set(identifiers.filter(Boolean).map((value) => String(value).toLowerCase()));
  return [player.twitchName, player.minecraftUUID, player.minecraftName].some(
    (value) => value && expected.has(String(value).toLowerCase())
  )
    ? player
    : null;
}

export async function getSnapshotProfileData(
  env,
  { minecraftUUID = '', minecraftName = '', twitchName = '' } = {},
  origin
) {
  // A profile reads many boards. Per-object cache match/put calls can exhaust
  // the invocation's subrequest budget on a cold cache. Read R2 directly here;
  // the profile endpoint already caches the assembled result.
  const manifest = await readManifest(env, origin, false);
  if (manifest.profileVersion === 1) {
    return readProfileShards(env, manifest, [minecraftUUID, minecraftName, twitchName], origin);
  }
  const leaderboardPlace = await findSnapshotPlayer(
    env,
    manifest,
    'setsUnlocked',
    [minecraftUUID, minecraftName],
    origin,
    false
  );
  const streamers = manifest.streamers || [];
  const companionStats = new Array(streamers.length);
  let nextStreamer = 0;
  // Two streamer lookups at a time: at most four R2 reads in flight.
  // Keep output ordered and leave room for the other profile APIs.
  const readStreamer = async (streamer) => {
    const identifiers = [twitchName, minecraftUUID, minecraftName];
    const [seasonPlayer, vaultsPlayer] = await Promise.all([
      findSnapshotProfilePlayer(
        env,
        manifest,
        snapshotBoardKey('seasonLevel', streamer.login),
        identifiers,
        origin,
        false
      ),
      findSnapshotProfilePlayer(
        env,
        manifest,
        snapshotBoardKey('vaultsJoined', streamer.login),
        identifiers,
        origin,
        false
      ),
    ]);
    const player = seasonPlayer || vaultsPlayer;
    if (!player) return null;
    return {
      streamer: streamer.login,
      twitchName: player.twitchName || null,
      alias: player.alias || null,
      seasonLevel: player.seasonLevel || 0,
      seasonLevelRank: seasonPlayer?.rank || null,
      vaultsJoined: player.vaultsJoined || 0,
      vaultsJoinedRank: vaultsPlayer?.rank || null,
      updatedAt: player.updatedAt || null,
    };
  };
  await Promise.all(
    Array.from({ length: Math.min(2, streamers.length) }, async () => {
      while (nextStreamer < streamers.length) {
        const index = nextStreamer++;
        companionStats[index] = await readStreamer(streamers[index]);
      }
    })
  );
  return {
    leaderboardPlace: leaderboardPlace
      ? {
          rank: leaderboardPlace.rank,
          playerUUID: leaderboardPlace.playerUUID,
          playerNickname: leaderboardPlace.playerNickname,
          setsUnlocked: leaderboardPlace.setsUnlocked,
        }
      : null,
    companionStats: companionStats.filter(Boolean),
  };
}

export async function getSnapshotLeaderboardPage(env, params, metric, origin) {
  const manifest = await readManifest(env, origin);
  const key = snapshotBoardKey(metric, params.streamer);
  const board = manifest.boards[key];
  const total = board?.total || 0;
  let limit = Math.max(1, Math.min(50, Number(params.limit) || 10));
  let offset = Math.max(0, Math.min(1_000_000, Number(params.offset) || 0));
  let focusPosition = null;
  if (params.targetPlayer && board) {
    const names = await readObject(env, `${manifest.prefix}${key}/names.json`, origin, true);
    const target = params.targetPlayer.trim().toLowerCase();
    if (Object.hasOwn(names, target)) focusPosition = names[target];
  }
  if (focusPosition !== null) {
    if (metric === 'setsUnlocked') limit = Math.max(5, limit);
    // Center on the actual row, not the shared rank of a potentially large tie.
    offset = Math.max(0, focusPosition - Math.floor((limit - 1) / 2));
  }
  const players = [];
  if (offset < total) {
    const firstChunk = Math.floor(offset / SNAPSHOT_CHUNK_SIZE);
    const lastChunk = Math.floor((Math.min(total, offset + limit) - 1) / SNAPSHOT_CHUNK_SIZE);
    for (let chunk = firstChunk; chunk <= lastChunk; chunk++) {
      const rows = await readObject(env, `${manifest.prefix}${key}/${chunk}.json`, origin, true);
      const start = Math.max(0, offset - chunk * SNAPSHOT_CHUNK_SIZE);
      const end = Math.min(rows.length, offset + limit - chunk * SNAPSHOT_CHUNK_SIZE);
      players.push(...rows.slice(start, end));
    }
  }
  return {
    metric,
    ...(metric !== 'setsUnlocked'
      ? { streamer: params.streamer, streamers: manifest.streamers }
      : {}),
    total,
    limit,
    offset,
    nextOffset: offset + players.length,
    hasMore: offset + players.length < total,
    players,
    focusPlayer: focusPosition === null ? null : players[focusPosition - offset] || null,
    snapshotGeneratedAt: manifest.generatedAt,
  };
}
