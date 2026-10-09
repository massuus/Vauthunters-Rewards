import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sqlite = await import('node:sqlite').catch(() => null);
import {
  importCompanionSnapshot,
  validateSnapshot,
  readSyncBody,
  MAX_SYNC_BYTES,
} from '../functions/utils/companion-sync.js';
import { onRequest } from '../functions/api/companion-sync.js';
import { companionRollbackStatements } from '../functions/utils/companion-sync-rollback.js';

function fixture() {
  const sql = new sqlite.DatabaseSync(':memory:');
  for (const migration of [
    '0001_companion_leaderboard.sql',
    '0002_companion_minecraft_identity.sql',
    '0007_companion_automation.sql',
    '0008_companion_sync_backup_rows.sql',
  ])
    sql.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
  const db = {
    prepare(query) {
      let args = [];
      const statement = {
        bind(...values) {
          args = values;
          return statement;
        },
        async first() {
          return (
            sql.prepare(query).get(Object.fromEntries(args.map((v, i) => [String(i + 1), v]))) ||
            null
          );
        },
        execute() {
          return {
            meta: sql
              .prepare(query)
              .run(Object.fromEntries(args.map((v, i) => [String(i + 1), v]))),
          };
        },
      };
      return statement;
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = statements.map((s) => s.execute());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sql, env: { LEADERBOARD_DB: db } };
}
const snapshot = (extra = {}) => ({
  streamer: 'mayaicefire',
  collectedAt: new Date().toISOString(),
  players: [{ name: 'viewer', skin: 'SomeSkin', alias: null, seasonLevel: 30, vaultsJoined: 7 }],
  ...extra,
});

test('automatic import authenticates before reading a body or accessing D1', async () => {
  const token = 'a'.repeat(64);
  for (const [authorization, expected] of [
    [null, 401],
    [`Bearer ${'b'.repeat(64)}`, 401],
    [`Bearer ${token}`, 400],
  ]) {
    const request = new Request('https://example.test/api/companion-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
      body: '{}',
    });
    assert.equal(
      (await onRequest({ request, env: { COMPANION_SYNC_TOKEN: token } })).status,
      expected
    );
  }
  assert.equal(
    (await onRequest({ request: new Request('https://example.test', { method: 'POST' }), env: {} }))
      .status,
    503
  );
});

test('rejects empty, stale, future, duplicate or malformed snapshots without clamping', () => {
  for (const payload of [
    snapshot({ players: [] }),
    snapshot({ collectedAt: '2020-01-01' }),
    snapshot({ collectedAt: new Date(Date.now() + 86400_000).toISOString() }),
    snapshot({ players: [...snapshot().players, ...snapshot().players] }),
    snapshot({ players: [{ ...snapshot().players[0], seasonLevel: -1 }] }),
    snapshot({ streamer: 'outsider' }),
  ])
    assert.throws(() => validateSnapshot(payload));
});

test('body size is enforced while streaming without trusting Content-Length', async () => {
  const request = new Request('https://example.test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: ' '.repeat(MAX_SYNC_BYTES + 1),
  });
  await assert.rejects(readSyncBody(request), (error) => error.status === 413);
});

test(
  'import is atomic, keeps identities and absent players, backs up changes, and retry is idempotent',
  { skip: !sqlite },
  async () => {
    const { sql, env } = fixture();
    sql.exec(`INSERT INTO companion_leaderboard_players VALUES ('mayaicefire','viewer','OldSkin',NULL,1,1,'manual','2025','2025','uuid','ActualName');
    INSERT INTO companion_leaderboard_players VALUES ('mayaicefire','absent','OldSkin',NULL,2,2,'manual','2025','2025',NULL,NULL);`);
    const before = sql
      .prepare('SELECT * FROM companion_leaderboard_players ORDER BY twitch_name')
      .all();
    const payload = snapshot();
    assert.equal(
      (await importCompanionSnapshot(env, { ...payload, dryRun: true })).status,
      'validated'
    );
    assert.equal(sql.prepare('SELECT count(*) n FROM companion_sync_state').get().n, 0);
    const result = await importCompanionSnapshot(env, payload);
    assert.equal(result.changed, 1);
    const viewer = sql
      .prepare("SELECT * FROM companion_leaderboard_players WHERE twitch_name='viewer'")
      .get();
    assert.equal(viewer.season_level, 30);
    assert.equal(viewer.minecraft_name, 'ActualName');
    assert.equal(sql.prepare('SELECT count(*) n FROM companion_leaderboard_players').get().n, 2);
    const backup = sql.prepare('SELECT * FROM companion_sync_backup ORDER BY twitch_name').all();
    assert.deepEqual(
      backup,
      before.filter((row) => row.twitch_name === 'viewer')
    );
    assert.equal((await importCompanionSnapshot(env, payload)).status, 'already-imported');
    await assert.rejects(
      importCompanionSnapshot(env, {
        ...payload,
        players: [{ ...payload.players[0], seasonLevel: 99 }],
      }),
      (error) => error.status === 409
    );
    await assert.rejects(
      importCompanionSnapshot(env, {
        ...payload,
        collectedAt: new Date(Date.parse(payload.collectedAt) - 1000).toISOString(),
      }),
      (error) => error.status === 409
    );
    // Exercise full restoration, not just backup serialization.
    await env.LEADERBOARD_DB.batch(
      companionRollbackStatements(env.LEADERBOARD_DB, 'mayaicefire', payload.collectedAt)
    );
    assert.deepEqual(
      sql.prepare('SELECT * FROM companion_leaderboard_players ORDER BY twitch_name').all(),
      before
    );
    sql.close();
  }
);

test('SQL failure rolls back both backup and player writes', { skip: !sqlite }, async () => {
  const { sql, env } = fixture();
  sql.exec(
    "CREATE TRIGGER reject_sync BEFORE UPDATE ON companion_sync_state BEGIN SELECT RAISE(ABORT, 'test failure'); END;"
  );
  await assert.rejects(importCompanionSnapshot(env, snapshot()));
  assert.equal(sql.prepare('SELECT count(*) n FROM companion_sync_state').get().n, 0);
  assert.equal(sql.prepare('SELECT count(*) n FROM companion_leaderboard_players').get().n, 0);
  sql.close();
});

test(
  'rollback removes newly introduced players but refuses a wrong watermark or later edits',
  { skip: !sqlite },
  async () => {
    const { sql, env } = fixture();
    const payload = snapshot();
    await importCompanionSnapshot(env, payload);
    await env.LEADERBOARD_DB.batch(
      companionRollbackStatements(
        env.LEADERBOARD_DB,
        payload.streamer,
        new Date(Date.now() - 60000).toISOString()
      )
    );
    assert.equal(sql.prepare('SELECT count(*) n FROM companion_leaderboard_players').get().n, 1);
    sql
      .prepare('UPDATE companion_leaderboard_players SET updated_at=?')
      .run(new Date(Date.now() + 60000).toISOString());
    await env.LEADERBOARD_DB.batch(
      companionRollbackStatements(env.LEADERBOARD_DB, payload.streamer, payload.collectedAt)
    );
    assert.equal(sql.prepare('SELECT count(*) n FROM companion_leaderboard_players').get().n, 1);
    sql.prepare('UPDATE companion_leaderboard_players SET updated_at=?').run(payload.collectedAt);
    await env.LEADERBOARD_DB.batch(
      companionRollbackStatements(env.LEADERBOARD_DB, payload.streamer, payload.collectedAt)
    );
    assert.equal(sql.prepare('SELECT count(*) n FROM companion_leaderboard_players').get().n, 0);
    assert.equal((await importCompanionSnapshot(env, payload)).status, 'already-imported');
    sql.close();
  }
);

test(
  'legacy backup migration preserves original rows without replacing a newer backup',
  { skip: !sqlite },
  async () => {
    const { sql, env } = fixture();
    const payload = snapshot();
    await importCompanionSnapshot(env, payload);
    const rows = sql.prepare('SELECT * FROM companion_leaderboard_players').all();
    sql.prepare('UPDATE companion_sync_state SET backup_json=?').run(JSON.stringify(rows));
    const migration = readFileSync(
      new URL('../migrations/0009_companion_legacy_backups.sql', import.meta.url),
      'utf8'
    );
    sql.exec(migration);
    assert.equal(sql.prepare('SELECT count(*) n FROM companion_sync_backup').get().n, 1);
    sql.exec('UPDATE companion_sync_backup SET season_level=123');
    sql.exec(migration);
    assert.equal(
      sql.prepare('SELECT season_level FROM companion_sync_backup').get().season_level,
      123
    );
    sql.close();
  }
);

test(
  'newer manual stats are not overwritten by an older collection',
  { skip: !sqlite },
  async () => {
    const { sql, env } = fixture();
    sql
      .prepare(
        `INSERT INTO companion_leaderboard_players (streamer_login,twitch_name,player_name,season_level,created_at,updated_at) VALUES ('mayaicefire','viewer','Skin',99,'2025',?)`
      )
      .run(new Date().toISOString());
    await importCompanionSnapshot(
      env,
      snapshot({ collectedAt: new Date(Date.now() - 60000).toISOString() })
    );
    assert.equal(
      sql.prepare('SELECT season_level FROM companion_leaderboard_players').get().season_level,
      99
    );
    sql.close();
  }
);

test(
  '10000 players import and identical snapshots produce no backup writes',
  { skip: !sqlite },
  async () => {
    const { sql, env } = fixture();
    const players = Array.from({ length: 10000 }, (_, i) => ({
      name: `viewer${i}`,
      skin: 'Skin',
      seasonLevel: i,
      vaultsJoined: 0,
    }));
    const first = snapshot({ players, collectedAt: new Date(Date.now() - 1000).toISOString() });
    assert.equal((await importCompanionSnapshot(env, first)).changed, 10000);
    assert.equal((await importCompanionSnapshot(env, snapshot({ players }))).changed, 0);
    assert.equal(sql.prepare('SELECT count(*) n FROM companion_sync_backup').get().n, 0);
    sql.close();
  }
);
