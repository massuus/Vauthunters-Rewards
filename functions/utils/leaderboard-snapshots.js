import { ApiError } from './http.js';

export const SNAPSHOT_MANIFEST_KEY = 'leaderboards/v1/current.json';
export const SNAPSHOT_DATA_PREFIX = 'leaderboards/v1/data/';
export const SNAPSHOT_CHUNK_SIZE = 250;
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;

export function snapshotBoardKey(metric, streamer = '') {
  return metric === 'setsUnlocked' ? metric : `${metric}/${streamer}`;
}

// This cache is shared by all page offsets and focus lookups at a data center.
// No request state or cross-request promises are kept in the isolate.
async function readObject(env, key, origin, immutable = false) {
  let cache;
  try {
    cache = caches.default;
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

async function readManifest(env, origin) {
  const manifest = await readObject(env, SNAPSHOT_MANIFEST_KEY, origin);
  if (manifest.schema !== 1 || !manifest.prefix?.startsWith(SNAPSHOT_DATA_PREFIX)) {
    throw new Error('Unsupported leaderboard snapshot.');
  }
  return manifest;
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

async function readPlayerAt(env, manifest, boardKey, position, origin) {
  if (!Number.isInteger(position) || position < 0) return null;
  const chunk = Math.floor(position / SNAPSHOT_CHUNK_SIZE);
  const rows = await readObject(env, `${manifest.prefix}${boardKey}/${chunk}.json`, origin, true);
  return rows[position % SNAPSHOT_CHUNK_SIZE] || null;
}

async function findSnapshotPlayer(env, manifest, boardKey, identifiers, origin) {
  if (!manifest.boards[boardKey]) return null;
  const names = await readObject(env, `${manifest.prefix}${boardKey}/names.json`, origin, true);
  for (const identifier of identifiers) {
    const key = String(identifier || '')
      .trim()
      .toLowerCase();
    if (key && Object.hasOwn(names, key)) {
      return readPlayerAt(env, manifest, boardKey, names[key], origin);
    }
  }
  return null;
}

export async function getSnapshotProfileData(
  env,
  { minecraftUUID = '', minecraftName = '', twitchName = '' } = {},
  origin
) {
  const manifest = await readManifest(env, origin);
  const leaderboardPlace = await findSnapshotPlayer(
    env,
    manifest,
    'setsUnlocked',
    [minecraftUUID, minecraftName],
    origin
  );
  const companionStats = [];
  for (const streamer of manifest.streamers || []) {
    const identifiers = [twitchName, minecraftUUID, minecraftName];
    const [seasonPlayer, vaultsPlayer] = await Promise.all([
      findSnapshotPlayer(
        env,
        manifest,
        snapshotBoardKey('seasonLevel', streamer.login),
        identifiers,
        origin
      ),
      findSnapshotPlayer(
        env,
        manifest,
        snapshotBoardKey('vaultsJoined', streamer.login),
        identifiers,
        origin
      ),
    ]);
    const player = seasonPlayer || vaultsPlayer;
    if (!player) continue;
    companionStats.push({
      streamer: streamer.login,
      twitchName: player.twitchName || null,
      alias: player.alias || null,
      seasonLevel: player.seasonLevel || 0,
      seasonLevelRank: seasonPlayer?.rank || null,
      vaultsJoined: player.vaultsJoined || 0,
      vaultsJoinedRank: vaultsPlayer?.rank || null,
      updatedAt: player.updatedAt || null,
    });
  }
  return {
    leaderboardPlace: leaderboardPlace
      ? {
          rank: leaderboardPlace.rank,
          playerUUID: leaderboardPlace.playerUUID,
          playerNickname: leaderboardPlace.playerNickname,
          setsUnlocked: leaderboardPlace.setsUnlocked,
        }
      : null,
    companionStats,
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
