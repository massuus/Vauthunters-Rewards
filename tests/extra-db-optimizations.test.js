import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  getLeaderboardPage,
  getLeaderboardPlacement,
  upsertLeaderboardRecord,
} from '../functions/utils/leaderboard.js';
import {
  upsertCompanionPlayers,
  updateCompanionMinecraftIdentity,
  resolveCompanionMinecraftIdentities,
} from '../functions/utils/companion-leaderboard.js';
import { onRequest as getSuggestions } from '../functions/api/players.js';
import { onRequest as getProfile } from '../functions/api/profile.js';
import { onRequest as getPublicLeaderboard } from '../functions/api/leaderboard.js';

const sqlite = await import('node:sqlite').catch(() => null);

test(
  'unlock pagination, indexed placements, and idempotent player writes',
  { skip: !sqlite },
  async () => {
    const database = new sqlite.DatabaseSync(':memory:');
    const migrations = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(migrations)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      database.exec(readFileSync(new URL(file, migrations), 'utf8'));
    }
    const queries = [];
    const db = {
      prepare(sql) {
        let values = [];
        const execute = (method) => {
          queries.push({ sql, values });
          const args = /\?\d/.test(sql)
            ? [Object.fromEntries(values.map((v, i) => [String(i + 1), v]))]
            : values;
          return database.prepare(sql)[method](...(values.length ? args : []));
        };
        const statement = {
          bind(...args) {
            values = args;
            return statement;
          },
          async run() {
            return { meta: execute('run') };
          },
          async all() {
            return { results: execute('all') };
          },
          async first() {
            return execute('get') || null;
          },
        };
        return statement;
      },
      async batch(statements) {
        return Promise.all(statements.map((s) => s.run()));
      },
    };
    const env = { LEADERBOARD_DB: db };
    try {
      const record = {
        playerUUID: '00000000-0000-0000-0000-000000000001',
        playerNickname: 'TestPlayer',
        setsUnlocked: 10,
        vaultHuntersTier: null,
        iskall85Tier: null,
        source: 'test',
      };
      assert.equal((await upsertLeaderboardRecord(env, record)).updated, true);
      database.exec("UPDATE leaderboard_players SET updated_at = 'old'");
      assert.deepEqual(await upsertLeaderboardRecord(env, { ...record, source: 'profile' }), {
        updated: false,
        skipped: true,
      });
      assert.equal(
        database.prepare('SELECT updated_at FROM leaderboard_players').get().updated_at,
        'old'
      );
      assert.equal(
        (await upsertLeaderboardRecord(env, { ...record, vaultHuntersTier: 'Gold' })).updated,
        true
      );
      assert.equal(
        (await upsertLeaderboardRecord(env, record)).updated,
        true,
        'nullable tier can be cleared'
      );

      const companion = {
        streamer: 'iskall85',
        players: [{ name: 'testplayer', skin: 'TestSkin', seasonLevel: 5 }],
      };
      await upsertCompanionPlayers(env, companion);
      const identity = {
        twitchName: 'testplayer',
        minecraftUUID: record.playerUUID,
        minecraftName: 'TestPlayer',
      };
      assert.equal((await updateCompanionMinecraftIdentity(env, identity)).updated, true);
      database.exec("UPDATE companion_leaderboard_players SET updated_at = 'old'");
      await upsertCompanionPlayers(env, { ...companion, source: 'another-import' });
      assert.equal((await updateCompanionMinecraftIdentity(env, identity)).updated, false);
      const resolution = await resolveCompanionMinecraftIdentities(env, {
        twitchNames: ['testplayer'],
        fetchJsonFn: () => {
          throw new Error('Must reuse stored identity');
        },
      });
      assert.equal(resolution.existing, 1);
      assert.equal(resolution.failed, 0);
      assert.equal(
        database.prepare('SELECT updated_at FROM companion_leaderboard_players').get().updated_at,
        'old'
      );
      assert.equal(
        (await updateCompanionMinecraftIdentity(env, { ...identity, minecraftName: 'Renamed' }))
          .updated,
        true
      );

      const insert = database.prepare(`INSERT INTO leaderboard_players
      (player_uuid, player_name, sets_unlocked, created_at, updated_at) VALUES (?, ?, ?, '', '')`);
      for (let i = 0; i < 9000; i++) insert.run(`id${i}`, `Player${i}`, Math.floor(i / 17));
      const expected = database
        .prepare(
          `SELECT player_uuid, RANK() OVER (ORDER BY sets_unlocked DESC) AS rank
      FROM leaderboard_players WHERE sets_unlocked > 0 ORDER BY sets_unlocked DESC, updated_at DESC,
      player_name COLLATE NOCASE ASC, player_uuid ASC`
        )
        .all();
      for (const offset of [0, 5, 10, 17, 30, 999, 4500, 8990, 9999]) {
        const page = await getLeaderboardPage(env, { offset, limit: 10 });
        assert.equal(page.total, expected.length);
        assert.deepEqual(
          page.players.map((p) => [p.playerUUID, p.rank]),
          expected.slice(offset, offset + 10).map((p) => [p.player_uuid, p.rank])
        );
      }
      const pageQuery = queries.findLast((q) => q.sql.includes('WITH page AS MATERIALIZED'));
      const plan = (query) =>
        database
          .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
          .all(Object.fromEntries(query.values.map((v, i) => [String(i + 1), v])))
          .map((p) => p.detail)
          .join('\n');
      assert.match(plan(pageQuery), /idx_leaderboard_page/);
      assert.doesNotMatch(plan(pageQuery), /CORRELATED/);
      const placement = await getLeaderboardPlacement(env, { playerNickname: 'testplayer' });
      assert.equal(placement.playerUUID, record.playerUUID);
      assert.match(plan(queries.at(-1)), /idx_leaderboard_name_lower/);
    } finally {
      database.close();
    }
  }
);

test('suggestions and profiles share canonical caches; mock profiles stay separate', async () => {
  const original = globalThis.caches;
  const entries = new Map();
  const matched = [];
  globalThis.caches = {
    default: {
      async match(key) {
        matched.push(key.url);
        return entries.get(key.url)?.clone();
      },
      async put(key, response) {
        entries.set(key.url, response.clone());
      },
    },
  };
  let reads = 0;
  let totalReads = 0;
  const env = {
    LEADERBOARD_DB: {
      prepare() {
        const statement = {
          bind() {
            return statement;
          },
          async run() {
            return {};
          },
          async all() {
            reads++;
            return { results: [{ name: 'Massuus' }] };
          },
          async first() {
            totalReads++;
            return { total: 100 };
          },
        };
        return statement;
      },
    },
  };
  try {
    for (const query of ['q=Massuus', 'noise=1&q=%20massuus%20', 'q=MASSUUS']) {
      const response = await getSuggestions({
        env,
        request: new Request(`https://example.test/api/players?${query}`),
      });
      assert.equal(response.status, 200);
    }
    assert.equal(reads, 1);
    for (const offset of [0, 10]) {
      const response = await getPublicLeaderboard({
        env,
        request: new Request(`https://example.test/api/leaderboard?offset=${offset}`),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).total, 100);
    }
    assert.equal(totalReads, 1, 'unlock pages share the cached total');
    assert.equal(reads, 3, 'each uncached page still loads its own players');
    entries.set(
      'https://example.test/api/profile?username=massuus',
      Response.json({ id: 'cached-profile' })
    );
    for (const query of ['username=Massuus', 'bust=123&username=%20MASSUUS%20&extra=1']) {
      const response = await getProfile({
        env,
        request: new Request(`https://example.test/api/profile?${query}`, {
          headers: { 'cache-control': 'no-cache' },
        }),
      });
      assert.deepEqual(await response.json(), { id: 'cached-profile' });
    }
    const matchesBeforeMock = matched.length;
    const mock = await getProfile({
      env,
      request: new Request('https://example.test/api/profile?username=massuus&mock=1'),
    });
    assert.equal((await mock.json()).id, 'mock');
    assert.equal(matched.length, matchesBeforeMock);
  } finally {
    if (original === undefined) delete globalThis.caches;
    else globalThis.caches = original;
  }
});
