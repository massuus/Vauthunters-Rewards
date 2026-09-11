import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCompanionLeaderboardPage } from '../functions/utils/companion-leaderboard.js';
import { onRequest } from '../functions/api/leaderboard.js';

// Node 22+ provides SQLite without adding a production dependency. Cache tests
// below also run on the application's supported Node 20 build environment.
const sqlite = await import('node:sqlite').catch(() => null);

test(
  'companion pages preserve global ranks and use the page index',
  { skip: !sqlite },
  async () => {
    const database = new sqlite.DatabaseSync(':memory:');
    const queries = [];
    const db = {
      prepare(sql) {
        let values = [];
        const statement = {
          bind(...args) {
            values = args;
            return statement;
          },
          async run() {
            return database.prepare(sql).run(...values);
          },
          async all() {
            queries.push({ sql, values });
            // D1 supports numbered positional parameters; node:sqlite binds them as names.
            const bindings = Object.fromEntries(values.map((value, i) => [String(i + 1), value]));
            return { results: database.prepare(sql).all(...(values.length ? [bindings] : [])) };
          },
          async first() {
            return (await statement.all()).results[0] || null;
          },
        };
        return statement;
      },
    };
    const env = { LEADERBOARD_DB: db };
    try {
      await getCompanionLeaderboardPage(env, {});
      database.exec(
        readFileSync(
          new URL('../migrations/0004_companion_page_indexes.sql', import.meta.url),
          'utf8'
        )
      );
      const insert = database.prepare(`INSERT INTO companion_leaderboard_players
      (streamer_login, twitch_name, player_name, alias, season_level, vaults_joined, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '', '')`);
      for (let i = 0; i < 9000; i++) {
        insert.run(
          'iskall85',
          `player${i}`,
          `skin${i}`,
          i % 3 ? 'Same alias' : null,
          Math.floor(i / 17),
          Math.floor(i / 31)
        );
      }
      insert.run('other', 'outsider', 'outsider', null, 999999, 999999);
      for (const [metric, column, secondary, index] of [
        ['seasonLevel', 'season_level', 'vaults_joined', 'idx_companion_page_season'],
        ['vaultsJoined', 'vaults_joined', 'season_level', 'idx_companion_page_vaults'],
      ]) {
        const expected = database
          .prepare(
            `SELECT twitch_name,
        RANK() OVER (ORDER BY ${column} DESC) AS rank
        FROM companion_leaderboard_players WHERE streamer_login = 'iskall85'
        ORDER BY ${column} DESC, ${secondary} DESC,
          COALESCE(alias, twitch_name) COLLATE NOCASE ASC, twitch_name ASC`
          )
          .all();
        for (const offset of [0, 5, 10, 17, 30, 31, 999, 4500, 8995, 9000]) {
          const page = await getCompanionLeaderboardPage(env, { metric, offset, limit: 10 });
          assert.equal(page.total, 9000);
          assert.deepEqual(
            page.players.map((p) => ({ name: p.twitchName, rank: p.rank })),
            expected.slice(offset, offset + 10).map((p) => ({ name: p.twitch_name, rank: p.rank }))
          );
          assert.equal(page.hasMore, offset + page.players.length < 9000);
        }
        const query = queries.findLast((q) => q.sql.includes('WITH page AS MATERIALIZED'));
        const bindings = Object.fromEntries(query.values.map((value, i) => [String(i + 1), value]));
        const plan = database.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(bindings);
        assert.ok(
          plan.some((row) => row.detail.includes(index)),
          JSON.stringify(plan)
        );
        assert.ok(!plan.some((row) => row.detail.includes('CORRELATED')), JSON.stringify(plan));
      }
    } finally {
      database.close();
    }
  }
);

test('public leaderboard refreshes and equivalent URLs reuse cached responses', async () => {
  const previousCaches = globalThis.caches;
  const entries = new Map();
  let reads = 0;
  let summaries = 0;
  globalThis.caches = {
    default: {
      async match(key) {
        return entries.get(key.url)?.clone();
      },
      async put(key, value) {
        entries.set(key.url, value.clone());
      },
    },
  };
  const env = {
    LEADERBOARD_DB: {
      prepare(sql) {
        const statement = {
          bind() {
            return statement;
          },
          async run() {
            return {};
          },
          async all() {
            reads++;
            if (sql.includes('GROUP BY streamer_login')) {
              summaries++;
              return { results: [{ streamer_login: 'iskall85', player_count: 100 }] };
            }
            return { results: [] };
          },
        };
        return statement;
      },
    },
  };
  try {
    for (const suffix of [
      '?metric=vaultsJoined',
      '?refresh=1&metric=vaultsJoined&streamer=Iskall85&limit=10&offset=0&noise=123',
      '?offset=0&limit=010&metric=vaultsJoined',
    ]) {
      const response = await onRequest({
        env,
        request: new Request(`https://example.test/api/leaderboard${suffix}`, {
          headers: { 'cache-control': 'no-cache' },
        }),
      });
      assert.equal(response.status, 200);
    }
    assert.equal(reads, 2, 'one page query and one shared summary query');
    const response = await onRequest({
      env,
      request: new Request('https://example.test/api/leaderboard?metric=seasonLevel'),
    });
    assert.equal(response.status, 200);
    assert.equal(reads, 3, 'switching metric needs only the page query');
    assert.equal(summaries, 1);
    entries.clear();
    await onRequest({
      env,
      request: new Request('https://example.test/api/leaderboard?metric=seasonLevel'),
    });
    assert.equal(summaries, 2, 'evicted/expired metadata is fetched again');
  } finally {
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
  }
});
