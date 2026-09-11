import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  buildSnapshot,
  publishSnapshots,
  pruneSnapshots,
} from '../workers/leaderboard-snapshots/publish.js';
import {
  getSnapshotLeaderboardPage,
  SNAPSHOT_MANIFEST_KEY,
} from '../functions/utils/leaderboard-snapshots.js';
import { onRequest } from '../functions/api/leaderboard.js';

function bucketFake() {
  const entries = new Map();
  let serial = 0;
  return {
    entries,
    failKey: null,
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      return {
        etag: entry.etag,
        size: entry.body.length,
        async json() {
          return JSON.parse(entry.body);
        },
      };
    },
    async put(key, body, options = {}) {
      if (this.failKey && key.includes(this.failKey)) throw new Error('Simulated R2 failure');
      const existing = entries.get(key);
      if (options.onlyIf?.etagMatches && existing?.etag !== options.onlyIf.etagMatches) return null;
      if (options.onlyIf?.etagDoesNotMatch === '*' && existing) return null;
      const entry = { body, etag: String(++serial), uploaded: new Date() };
      entries.set(key, entry);
      return { etag: entry.etag };
    },
    async list({ prefix, limit }) {
      return {
        objects: [...entries]
          .filter(([key]) => key.startsWith(prefix))
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(0, limit)
          .map(([key, entry]) => ({ key, uploaded: entry.uploaded })),
      };
    },
    async delete(keys) {
      keys.forEach((key) => entries.delete(key));
    },
  };
}

async function seedBucket(snapshot, bucket = bucketFake()) {
  for (const { key, data } of snapshot.objects) await bucket.put(key, JSON.stringify(data));
  await bucket.put(SNAPSHOT_MANIFEST_KEY, JSON.stringify(snapshot.manifest));
  return bucket;
}

const companion = (i) => ({
  streamer_login: 'iskall85',
  twitch_name: `player${i}`,
  player_name: `skin${i}`,
  alias: i % 3 ? 'Same name' : null,
  minecraft_uuid: null,
  minecraft_name: `mc${i}`,
  season_level: Math.floor(i / 17),
  vaults_joined: Math.floor(i / 31),
  updated_at: '2026-09-11T00:00:00Z',
});

test('snapshot pages handle chunk boundaries, tied focus, unknown names, and zero D1 reads', async () => {
  const snapshot = buildSnapshot(
    [],
    Array.from({ length: 1000 }, (_, i) => companion(i)),
    7
  );
  const bucket = await seedBucket(snapshot);
  const env = {
    LEADERBOARD_SNAPSHOTS: bucket,
    LEADERBOARD_DB: {
      prepare() {
        throw new Error('Public snapshot reads must never touch D1');
      },
    },
  };
  const all = snapshot.objects
    .filter((o) => /seasonLevel\/iskall85\/\d+\.json$/.test(o.key))
    .flatMap((o) => o.data);
  for (const offset of [0, 245, 250, 450, 999, 1000, 999999]) {
    const page = await getSnapshotLeaderboardPage(
      env,
      { streamer: 'iskall85', offset, limit: 20 },
      'seasonLevel',
      'https://example.test'
    );
    assert.deepEqual(page.players, all.slice(offset, offset + 20));
    assert.equal(page.total, 1000);
    assert.equal(page.hasMore, offset + page.players.length < 1000);
    assert.equal(page.snapshotGeneratedAt, snapshot.manifest.generatedAt);
  }
  const focus = await getSnapshotLeaderboardPage(
    env,
    { streamer: 'iskall85', targetPlayer: 'MC500', limit: 10 },
    'seasonLevel',
    'https://example.test'
  );
  assert.equal(focus.focusPlayer.twitchName, 'player500');
  assert.ok(
    focus.players.some((p) => p.twitchName === 'player500'),
    'focus remains visible inside a tie'
  );
  const missing = await getSnapshotLeaderboardPage(
    env,
    { streamer: 'missing', targetPlayer: '__proto__' },
    'seasonLevel',
    'https://example.test'
  );
  assert.deepEqual(missing.players, []);
  assert.equal(missing.focusPlayer, null);
  const emptyUnlocks = await getSnapshotLeaderboardPage(
    env,
    {},
    'setsUnlocked',
    'https://example.test'
  );
  assert.equal(emptyUnlocks.total, 0);
  const response = await onRequest({
    env,
    request: new Request('https://example.test/api/leaderboard?metric=seasonLevel'),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).snapshotGeneratedAt, snapshot.manifest.generatedAt);
  const unavailable = await onRequest({
    env: { ...env, LEADERBOARD_SNAPSHOTS: bucketFake() },
    request: new Request('https://example.test/api/leaderboard?metric=seasonLevel'),
  });
  assert.equal(unavailable.status, 503, 'missing snapshots do not silently fall back to D1');
});

const sqlite = await import('node:sqlite').catch(() => null);
test(
  'snapshot SQL migrations, global ranking parity, change detection, and failed publication',
  { skip: !sqlite },
  async () => {
    const database = new sqlite.DatabaseSync(':memory:');
    const migrations = new URL('../migrations/', import.meta.url);
    for (const name of readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      database.exec(readFileSync(new URL(name, migrations), 'utf8'));
    }
    const insert = database.prepare(`INSERT INTO companion_leaderboard_players
    (streamer_login,twitch_name,player_name,alias,season_level,vaults_joined,updated_at,created_at)
    VALUES ('iskall85',?,?,?,?,?,'2026-09-11','2026-09-11')`);
    for (let i = 0; i < 9000; i++) {
      const row = companion(i);
      insert.run(row.twitch_name, row.player_name, row.alias, row.season_level, row.vaults_joined);
    }
    const unlockInsert = database.prepare(`INSERT INTO leaderboard_players
    (player_uuid,player_name,sets_unlocked,updated_at,created_at) VALUES (?,?,?,'2026-09-11','2026-09-11')`);
    for (let i = 0; i < 3000; i++) unlockInsert.run(`uuid${i}`, `Player${i}`, Math.floor(i / 17));
    let revisionReads = 0;
    let fullExports = 0;
    const env = {
      LEADERBOARD_SNAPSHOTS: bucketFake(),
      LEADERBOARD_DB: {
        prepare(sql) {
          return {
            sql,
            async first() {
              revisionReads++;
              return database.prepare(sql).get();
            },
          };
        },
        async batch(statements) {
          fullExports++;
          return statements.map((s) => ({ results: database.prepare(s.sql).all() }));
        },
      },
    };
    try {
      const published = await publishSnapshots(env);
      assert.equal(published.changed, true);
      assert.equal(fullExports, 1);
      for (const [metric, primary, secondary] of [
        ['seasonLevel', 'season_level', 'vaults_joined'],
        ['vaultsJoined', 'vaults_joined', 'season_level'],
      ]) {
        const expected = database
          .prepare(
            `SELECT twitch_name, RANK() OVER (ORDER BY ${primary} DESC) AS rank
        FROM companion_leaderboard_players ORDER BY ${primary} DESC, ${secondary} DESC,
        COALESCE(alias,twitch_name) COLLATE NOCASE, twitch_name`
          )
          .all();
        for (const offset of [0, 245, 4500, 8990]) {
          const page = await getSnapshotLeaderboardPage(
            env,
            { streamer: 'iskall85', limit: 20, offset },
            metric,
            'https://example.test'
          );
          assert.deepEqual(
            page.players.map((p) => [p.twitchName, p.rank]),
            expected.slice(offset, offset + 20).map((p) => [p.twitch_name, p.rank])
          );
        }
      }
      const expected = database
        .prepare(
          `SELECT player_uuid, RANK() OVER (ORDER BY sets_unlocked DESC) AS rank
      FROM leaderboard_players WHERE sets_unlocked > 0 ORDER BY sets_unlocked DESC, updated_at DESC,
      player_name COLLATE NOCASE, player_uuid`
        )
        .all();
      const page = await getSnapshotLeaderboardPage(
        env,
        { offset: 245, limit: 20 },
        'setsUnlocked',
        'https://example.test'
      );
      assert.deepEqual(
        page.players.map((p) => [p.playerUUID, p.rank]),
        expected.slice(245, 265).map((p) => [p.player_uuid, p.rank])
      );
      const focused = await getSnapshotLeaderboardPage(
        env,
        { targetPlayer: 'UUID500', limit: 1 },
        'setsUnlocked',
        'https://example.test'
      );
      assert.equal(focused.focusPlayer.playerUUID, 'uuid500');
      assert.equal(focused.limit, 5);

      const oldPointer = env.LEADERBOARD_SNAPSHOTS.entries.get(SNAPSHOT_MANIFEST_KEY).body;
      assert.equal((await publishSnapshots(env)).changed, false);
      assert.equal(fullExports, 1, 'idle tick must not scan player tables');
      assert.equal(revisionReads, 2);
      database.exec(
        "UPDATE leaderboard_players SET source = 'import'; UPDATE companion_leaderboard_players SET alias = alias"
      );
      assert.equal(
        (await publishSnapshots(env)).changed,
        false,
        'irrelevant/no-op SQL updates do not dirty the snapshot'
      );
      database.exec(
        "UPDATE companion_leaderboard_players SET minecraft_name = 'NewName' WHERE twitch_name = 'player0'"
      );
      env.LEADERBOARD_SNAPSHOTS.failKey = '/names.json';
      await assert.rejects(publishSnapshots(env), /Simulated R2 failure/);
      assert.equal(env.LEADERBOARD_SNAPSHOTS.entries.get(SNAPSHOT_MANIFEST_KEY).body, oldPointer);
      env.LEADERBOARD_SNAPSHOTS.failKey = null;
      database.exec("DELETE FROM leaderboard_players WHERE player_uuid = 'uuid500'");
      assert.equal((await publishSnapshots(env)).changed, true);
      const name = await getSnapshotLeaderboardPage(
        env,
        { streamer: 'iskall85', targetPlayer: 'NewName' },
        'seasonLevel',
        'https://example.test'
      );
      assert.equal(name.focusPlayer.twitchName, 'player0');
    } finally {
      database.close();
    }
  }
);

test('conditional publication cannot replace a newer manifest; cleanup retains active old data', async () => {
  const bucket = bucketFake();
  const first = buildSnapshot([], [companion(1)], 1);
  await seedBucket(first, bucket);
  const put = bucket.put.bind(bucket);
  bucket.put = async (key, body, options) => {
    if (key === SNAPSHOT_MANIFEST_KEY && options?.onlyIf) {
      await put(key, JSON.stringify({ ...first.manifest, revision: 3 }));
    }
    return put(key, body, options);
  };
  const result = await publishSnapshots({
    LEADERBOARD_SNAPSHOTS: bucket,
    LEADERBOARD_DB: {
      prepare() {
        return {
          async first() {
            return { revision: 2 };
          },
        };
      },
      async batch() {
        return [{ results: [{ revision: 2 }] }, { results: [] }, { results: [companion(2)] }];
      },
    },
  });
  assert.equal(result.changed, false);
  assert.equal((await (await bucket.get(SNAPSHOT_MANIFEST_KEY)).json()).revision, 3);
  for (const entry of bucket.entries.values()) entry.uploaded = new Date('2020-01-01');
  await pruneSnapshots(bucket);
  assert.ok(
    first.objects.every((object) => bucket.entries.has(object.key)),
    'active data never expires'
  );
  assert.equal(bucket.entries.size, first.objects.length + 1, 'orphaned objects are removed');
});
