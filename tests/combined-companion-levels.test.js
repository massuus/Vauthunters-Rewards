import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSnapshot } from '../workers/leaderboard-snapshots/publish.js';
import {
  getSnapshotLeaderboardPage,
  SNAPSHOT_MANIFEST_KEY,
} from '../functions/utils/leaderboard-snapshots.js';
import { getCompanionLeaderboardPage } from '../functions/utils/companion-leaderboard.js';
const sqlite = await import('node:sqlite').catch(() => null);
const rows = [
  ['iskall85', 'Alice', 'Same alias', 40, 2, '2026-11-01'],
  ['other', 'alice', 'New alias', 60, 3, '2026-11-02'],
  ['iskall85', 'bob', 'Same alias', 100, 4, '2026-11-01'],
  ['other', 'carol', null, 50, 1, '2026-11-01'],
].map(([streamer_login, twitch_name, alias, season_level, vaults_joined, updated_at]) => ({
  streamer_login,
  twitch_name,
  alias,
  season_level,
  vaults_joined,
  updated_at,
  player_name: 'steve',
  minecraft_name: null,
  minecraft_uuid: null,
}));
function bucket(snapshot) {
  const objects = new Map(snapshot.objects.map((o) => [o.key, o.data]));
  objects.set(SNAPSHOT_MANIFEST_KEY, snapshot.manifest);
  return {
    async get(key) {
      return objects.has(key) ? { size: 100, json: async () => objects.get(key) } : null;
    },
  };
}

test('combined snapshots sum by Twitch account, retain distinct aliases, ties and focused pagination', async () => {
  const snapshot = buildSnapshot([], rows, 1);
  const env = { LEADERBOARD_SNAPSHOTS: bucket(snapshot) };
  const page = await getSnapshotLeaderboardPage(
    env,
    { limit: 2, offset: 0 },
    'combinedLevel',
    'https://test.example'
  );
  assert.equal(page.total, 3);
  assert.equal(page.hasMore, true);
  assert.deepEqual(
    page.players.map((p) => [p.twitchName, p.seasonLevel, p.rank]),
    [
      ['alice', 100, 1],
      ['bob', 100, 1],
    ]
  );
  assert.equal(page.players[0].playerNickname, 'New alias');
  assert.equal(page.players[0].vaultsJoined, 5);
  const focused = await getSnapshotLeaderboardPage(
    env,
    { limit: 1, targetPlayer: 'carol' },
    'combinedLevel',
    'https://test.example'
  );
  assert.equal(focused.focusPlayer.rank, 3);
  assert.equal(focused.offset, 2);
  assert.equal(focused.hasMore, false);
});

test(
  'D1 combined ranking matches snapshots, supports focus, empty pages and rollout fallback',
  { skip: !sqlite },
  async () => {
    const database = new sqlite.DatabaseSync(':memory:');
    try {
      for (const name of [
        '0001_companion_leaderboard.sql',
        '0002_companion_minecraft_identity.sql',
      ])
        database.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
      const insert = database.prepare(`INSERT INTO companion_leaderboard_players
      (streamer_login,twitch_name,player_name,alias,season_level,vaults_joined,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`);
      for (const r of rows)
        insert.run(
          r.streamer_login,
          r.twitch_name,
          r.player_name,
          r.alias,
          r.season_level,
          r.vaults_joined,
          '',
          r.updated_at
        );
      const db = {
        prepare(sql) {
          let bindings = {};
          const statement = {
            bind(...values) {
              bindings = Object.fromEntries(values.map((v, i) => [i + 1, v]));
              return statement;
            },
            async all() {
              return { results: database.prepare(sql).all(bindings) };
            },
            async first() {
              return database.prepare(sql).get(bindings) || null;
            },
          };
          return statement;
        },
      };
      const env = { LEADERBOARD_DB: db };
      const page = await getCompanionLeaderboardPage(env, {
        metric: 'combinedLevel',
        limit: 2,
        offset: 0,
      });
      assert.deepEqual(
        page.players.map((p) => [p.twitchName, p.seasonLevel, p.rank]),
        [
          ['alice', 100, 1],
          ['bob', 100, 1],
        ]
      );
      const focus = await getCompanionLeaderboardPage(env, {
        metric: 'combinedLevel',
        limit: 1,
        targetPlayer: 'carol',
      });
      assert.equal(focus.offset, 2);
      assert.equal(focus.focusPlayer.rank, 3);
      const empty = await getCompanionLeaderboardPage(env, { metric: 'combinedLevel', offset: 50 });
      assert.equal(empty.total, 3);
      assert.equal(empty.players.length, 0);
      const snapshot = buildSnapshot([], rows, 1);
      delete snapshot.manifest.boards.combinedLevel;
      const fallback = await getSnapshotLeaderboardPage(
        { ...env, LEADERBOARD_SNAPSHOTS: bucket(snapshot) },
        { limit: 2 },
        'combinedLevel',
        'https://test.example'
      );
      assert.deepEqual(fallback.players, page.players);
    } finally {
      database.close();
    }
  }
);
