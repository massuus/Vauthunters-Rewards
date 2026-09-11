import {
  SNAPSHOT_MANIFEST_KEY,
  SNAPSHOT_DATA_PREFIX,
  SNAPSHOT_CHUNK_SIZE,
  snapshotBoardKey,
} from '../../functions/utils/leaderboard-snapshots.js';

const MAX_ROWS_PER_TABLE = 50_000;
const REVISION_SQL = 'SELECT revision FROM leaderboard_snapshot_revision WHERE id = 1';

// SQLite NOCASE only folds ASCII. Compare remaining Unicode by code point,
// matching SQLite's UTF-8 binary ordering rather than locale-dependent sorting.
function compareText(left, right, noCase = false) {
  const normalize = (value) =>
    noCase
      ? String(value || '').replace(/[A-Z]/g, (char) => char.toLowerCase())
      : String(value || '');
  const a = Array.from(normalize(left));
  const b = Array.from(normalize(right));
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const difference = a[i].codePointAt(0) - b[i].codePointAt(0);
    if (difference) return difference;
  }
  return a.length - b.length;
}

function rankPlayers(players, metric, compare) {
  const sorted = [...players].sort(compare);
  let rank = 1;
  return sorted.map((player, index) => {
    if (index === 0 || player[metric] !== sorted[index - 1][metric]) rank = index + 1;
    return { ...player, rank };
  });
}

export function buildSnapshot(unlockRows, companionRows, revision, now = new Date()) {
  if (unlockRows.length > MAX_ROWS_PER_TABLE || companionRows.length > MAX_ROWS_PER_TABLE) {
    throw new Error('Snapshot row limit exceeded; keep serving the previous snapshot.');
  }
  const prefix = `${SNAPSHOT_DATA_PREFIX}${now.toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}/`;
  const boards = new Map();
  const unlocks = unlockRows
    .filter((row) => row.sets_unlocked > 0)
    .map((row) => ({
      playerUUID: row.player_uuid,
      playerNickname: row.player_name,
      setsUnlocked: row.sets_unlocked,
      vaultHuntersTier: row.vault_hunters_tier || null,
      iskall85Tier: row.iskall85_tier || null,
      updatedAt: row.updated_at || null,
    }));
  boards.set(
    'setsUnlocked',
    rankPlayers(
      unlocks,
      'setsUnlocked',
      (a, b) =>
        b.setsUnlocked - a.setsUnlocked ||
        compareText(b.updatedAt, a.updatedAt) ||
        compareText(a.playerNickname, b.playerNickname, true) ||
        compareText(a.playerUUID, b.playerUUID)
    )
  );
  const groups = new Map();
  for (const row of companionRows) {
    if (!groups.has(row.streamer_login)) groups.set(row.streamer_login, []);
    groups.get(row.streamer_login).push({
      twitchName: row.twitch_name,
      playerNickname: row.alias || row.twitch_name,
      alias: row.alias ?? null,
      skinName: row.player_name,
      minecraftUUID: row.minecraft_uuid || null,
      minecraftName: row.minecraft_name || null,
      seasonLevel: row.season_level,
      vaultsJoined: row.vaults_joined,
      updatedAt: row.updated_at || null,
    });
  }
  const streamers = [];
  for (const [streamer, players] of groups) {
    if (!/^[a-z0-9_]{1,25}$/.test(streamer)) throw new Error('Invalid stored streamer login.');
    streamers.push({
      login: streamer,
      playerCount: players.length,
      updatedAt:
        players.reduce((latest, p) => (p.updatedAt > latest ? p.updatedAt : latest), '') || null,
    });
    for (const [metric, secondary] of [
      ['seasonLevel', 'vaultsJoined'],
      ['vaultsJoined', 'seasonLevel'],
    ]) {
      boards.set(
        snapshotBoardKey(metric, streamer),
        rankPlayers(
          players,
          metric,
          (a, b) =>
            b[metric] - a[metric] ||
            b[secondary] - a[secondary] ||
            compareText(a.alias ?? a.twitchName, b.alias ?? b.twitchName, true) ||
            compareText(a.twitchName, b.twitchName)
        )
      );
    }
  }
  streamers.sort((a, b) => compareText(a.login, b.login, true));
  const manifest = {
    schema: 1,
    revision,
    generatedAt: now.toISOString(),
    prefix,
    streamers,
    boards: {},
  };
  const objects = [];
  for (const [key, players] of boards) {
    manifest.boards[key] = { total: players.length };
    const names = Object.create(null);
    players.forEach((player, index) => {
      const identifiers =
        key === 'setsUnlocked'
          ? [player.playerUUID, player.playerNickname]
          : [player.twitchName, player.skinName, player.minecraftName, player.alias];
      for (const name of identifiers) {
        if (name && !Object.hasOwn(names, name.toLowerCase())) names[name.toLowerCase()] = index;
      }
    });
    objects.push({ key: `${prefix}${key}/names.json`, data: names });
    for (let offset = 0; offset < players.length; offset += SNAPSHOT_CHUNK_SIZE) {
      objects.push({
        key: `${prefix}${key}/${offset / SNAPSHOT_CHUNK_SIZE}.json`,
        data: players.slice(offset, offset + SNAPSHOT_CHUNK_SIZE),
      });
    }
  }
  return { manifest, objects };
}

export async function publishSnapshots(env) {
  const bucket = env.LEADERBOARD_SNAPSHOTS;
  const previousObject = await bucket.get(SNAPSHOT_MANIFEST_KEY);
  const previous = previousObject ? await previousObject.json() : null;
  const current = await env.LEADERBOARD_DB.prepare(REVISION_SQL).first();
  if (!current) throw new Error('Apply snapshot migration 0006 before publishing.');
  if (previous?.schema === 1 && previous.revision === current.revision) {
    return { changed: false, revision: current.revision };
  }
  // D1 batch executes these reads in one transaction. The revision therefore
  // describes exactly the exported data, even while another import is running.
  const [revision, unlocks, companions] = await env.LEADERBOARD_DB.batch([
    env.LEADERBOARD_DB.prepare(REVISION_SQL),
    env.LEADERBOARD_DB.prepare(`SELECT player_uuid, player_name, sets_unlocked,
      vault_hunters_tier, iskall85_tier, updated_at FROM leaderboard_players LIMIT ${MAX_ROWS_PER_TABLE + 1}`),
    env.LEADERBOARD_DB.prepare(`SELECT streamer_login, twitch_name, player_name, alias,
      minecraft_uuid, minecraft_name, season_level, vaults_joined, updated_at
      FROM companion_leaderboard_players LIMIT ${MAX_ROWS_PER_TABLE + 1}`),
  ]);
  const snapshot = buildSnapshot(unlocks.results, companions.results, revision.results[0].revision);
  if (snapshot.objects.length > 700) throw new Error('Snapshot exceeds publisher object budget.');
  // Write immutable objects first. A failed upload leaves the old manifest intact.
  for (let index = 0; index < snapshot.objects.length; index += 6) {
    await Promise.all(
      snapshot.objects.slice(index, index + 6).map(async ({ key, data }) => {
        const body = JSON.stringify(data);
        if (new TextEncoder().encode(body).length > 8 * 1024 * 1024)
          throw new Error('Snapshot object too large.');
        await bucket.put(key, body, { httpMetadata: { contentType: 'application/json' } });
      })
    );
  }
  const published = await bucket.put(SNAPSHOT_MANIFEST_KEY, JSON.stringify(snapshot.manifest), {
    httpMetadata: { contentType: 'application/json' },
    onlyIf: previousObject ? { etagMatches: previousObject.etag } : { etagDoesNotMatch: '*' },
  });
  return {
    changed: Boolean(published),
    revision: snapshot.manifest.revision,
    objects: snapshot.objects.length,
    rowsRead: [revision, unlocks, companions].reduce(
      (sum, result) => sum + Number(result.meta?.rows_read || 0),
      0
    ),
  };
}

export async function pruneSnapshots(bucket, now = Date.now()) {
  const object = await bucket.get(SNAPSHOT_MANIFEST_KEY);
  if (!object) return;
  const manifest = await object.json();
  if (!manifest.prefix?.startsWith(SNAPSHOT_DATA_PREFIX)) return;
  // Retain the active snapshot indefinitely, even when refreshes fail for days.
  // Process at most 1,000 old objects per run; immutable keys sort by creation time.
  const page = await bucket.list({ prefix: SNAPSHOT_DATA_PREFIX, limit: 1000 });
  const obsolete = page.objects
    .filter(
      (entry) =>
        !entry.key.startsWith(manifest.prefix) &&
        new Date(entry.uploaded).getTime() < now - 24 * 60 * 60 * 1000
    )
    .map((entry) => entry.key);
  if (obsolete.length) await bucket.delete(obsolete);
}
