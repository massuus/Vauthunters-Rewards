import { ApiError } from './http.js';

export const SYNC_STREAMERS = [
  'hoy_82',
  'iskall85',
  'therealhellfirem4ge',
  'linahun',
  'mastercwg',
  'mayaicefire',
  'stressmonstah',
];
export const MAX_SYNC_BYTES = 2 * 1024 * 1024;

export async function authorizeCompanionSync(request, env) {
  const secret = env.COMPANION_SYNC_TOKEN;
  if (!/^[a-f0-9]{64}$/.test(secret || ''))
    throw new ApiError(503, 'Automatic imports are disabled.');
  const supplied = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!supplied) throw new ApiError(401, 'Unauthorized.');
  // Web Crypto verifies the MAC in constant time; never put credentials in URLs.
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(secret));
  if (!(await crypto.subtle.verify('HMAC', key, signature, encoder.encode(supplied))))
    throw new ApiError(401, 'Unauthorized.');
}

export async function readSyncBody(request, maxBytes = MAX_SYNC_BYTES) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new ApiError(415, 'Use application/json.');
  if (Number(request.headers.get('content-length')) > maxBytes)
    throw new ApiError(413, 'Import is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'Missing import.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError(413, 'Import is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, 'Invalid JSON.');
  }
}

export function validateSnapshot(payload, now = Date.now()) {
  if (!payload || !SYNC_STREAMERS.includes(payload.streamer))
    throw new ApiError(400, 'Unsupported streamer.');
  const timestamp = Date.parse(payload.collectedAt);
  if (
    !Number.isFinite(timestamp) ||
    timestamp > now + 5 * 60_000 ||
    timestamp < now - 7 * 86400_000
  )
    throw new ApiError(400, 'Collection timestamp is invalid or expired.');
  if (
    !Array.isArray(payload.players) ||
    payload.players.length < 1 ||
    payload.players.length > 10000
  )
    throw new ApiError(400, 'Provide 1 to 10000 collected players.');
  const seen = new Set();
  const players = payload.players
    .map((p) => {
      if (
        typeof p?.name !== 'string' ||
        !/^[a-z0-9_]{1,25}$/i.test(p.name) ||
        typeof p.skin !== 'string' ||
        !/^[a-z0-9_]{1,16}$/i.test(p.skin) ||
        ![p.seasonLevel, p.vaultsJoined].every(
          (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000
        ) ||
        (p.alias !== null &&
          p.alias !== undefined &&
          (typeof p.alias !== 'string' || p.alias.length > 64))
      )
        throw new ApiError(400, 'Invalid collected player.');
      const name = p.name.toLowerCase();
      if (seen.has(name)) throw new ApiError(400, 'Duplicate collected player.');
      seen.add(name);
      return {
        name,
        skin: p.skin,
        alias: p.alias?.trim() || null,
        seasonLevel: p.seasonLevel,
        vaultsJoined: p.vaultsJoined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { streamer: payload.streamer, collectedAt: new Date(timestamp).toISOString(), players };
}

export async function importCompanionSnapshot(env, payload) {
  const snapshot = validateSnapshot(payload);
  const db = env.LEADERBOARD_DB;
  if (!db) throw new ApiError(503, 'Leaderboard unavailable.');
  const { streamer, collectedAt, players } = snapshot;
  const digestBytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(snapshot))
  );
  const digest = Array.from(new Uint8Array(digestBytes), (n) =>
    n.toString(16).padStart(2, '0')
  ).join('');
  const previous = await db
    .prepare('SELECT collected_at, digest FROM companion_sync_state WHERE streamer_login = ?1')
    .bind(streamer)
    .first();
  if (previous?.collected_at === collectedAt && previous.digest === digest)
    return { status: 'already-imported', streamer, players: players.length };
  if (previous?.collected_at >= collectedAt)
    throw new ApiError(409, 'A newer or conflicting collection is already stored.');
  if (payload.dryRun === true) return { status: 'validated', streamer, players: players.length };
  const importedAt = new Date().toISOString();
  // D1 batch is transactional. Backup, upsert, and watermark either all commit or all roll back.
  // The predicates also protect against concurrent or delayed deliveries after the read above.
  const result = await db.batch([
    db
      .prepare(`INSERT OR IGNORE INTO companion_sync_state (streamer_login) VALUES (?1)`)
      .bind(streamer),
    db
      .prepare(
        `DELETE FROM companion_sync_backup WHERE streamer_login = ?1
      AND (SELECT collected_at FROM companion_sync_state WHERE streamer_login = ?1) < ?2`
      )
      .bind(streamer, collectedAt),
    db
      .prepare(
        `INSERT INTO companion_sync_backup
      SELECT * FROM companion_leaderboard_players WHERE streamer_login = ?1
      AND (SELECT collected_at FROM companion_sync_state WHERE streamer_login = ?1) < ?2`
      )
      .bind(streamer, collectedAt),
    db
      .prepare(
        `INSERT INTO companion_leaderboard_players
      (streamer_login, twitch_name, player_name, alias, season_level, vaults_joined, source, created_at, updated_at)
      SELECT ?1, json_extract(value, '$.name'), json_extract(value, '$.skin'),
        json_extract(value, '$.alias'), json_extract(value, '$.seasonLevel'),
        json_extract(value, '$.vaultsJoined'), 'oracle-companion-sync', ?3, ?3
      FROM json_each(?2)
      WHERE (SELECT collected_at FROM companion_sync_state WHERE streamer_login = ?1) < ?3
      ON CONFLICT(streamer_login, twitch_name) DO UPDATE SET
        player_name = excluded.player_name, alias = excluded.alias,
        season_level = excluded.season_level, vaults_joined = excluded.vaults_joined,
        source = excluded.source, updated_at = excluded.updated_at
      WHERE companion_leaderboard_players.updated_at <= excluded.updated_at
        AND (companion_leaderboard_players.player_name IS NOT excluded.player_name
          OR companion_leaderboard_players.alias IS NOT excluded.alias
          OR companion_leaderboard_players.season_level IS NOT excluded.season_level
          OR companion_leaderboard_players.vaults_joined IS NOT excluded.vaults_joined)`
      )
      .bind(streamer, JSON.stringify(players), collectedAt),
    db
      .prepare(
        `UPDATE companion_sync_state SET previous_collected_at = collected_at, collected_at = ?2, digest = ?3,
      player_count = ?4, imported_at = ?5 WHERE streamer_login = ?1 AND collected_at < ?2`
      )
      .bind(streamer, collectedAt, digest, players.length, importedAt),
  ]);
  if (!result[4]?.meta?.changes)
    throw new ApiError(409, 'Collection was superseded; no changes made.');
  return {
    status: 'imported',
    streamer,
    players: players.length,
    changed: result[3]?.meta?.changes || 0,
    collectedAt,
  };
}
