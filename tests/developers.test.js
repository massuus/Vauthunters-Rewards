import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVELOPERS, isDeveloper, grantDeveloperRewards } from '../functions/utils/developers.js';
import { onRequest } from '../functions/api/profile.js';

const catalog = [
  {
    id: 'old_event',
    unavailable: true,
    cost: -1,
    sets: { 'the_vault:helmet': ['the_vault:gear/armor/test/helmet'] },
  },
  { id: 'new_reward', unavailable: false, sets: { 'the_vault:companion': ['the_vault:dino'] } },
];

test('mod developer list matches UUIDs in both formats, never usernames', () => {
  assert.equal(Object.keys(DEVELOPERS).length, 15);
  for (const [name, uuid] of Object.entries(DEVELOPERS)) {
    assert.equal(isDeveloper(uuid), true);
    assert.equal(isDeveloper(uuid.replaceAll('-', '').toUpperCase()), true);
    assert.equal(isDeveloper(name), false);
  }
  assert.equal(isDeveloper('18f179ee3dba4ce286508ef714f44e80'), true);
  assert.equal(isDeveloper(null), false);
  assert.equal(isDeveloper('00000000-0000-0000-0000-000000000000'), false);
});

test('developer override includes unavailable catalog rewards and deduplicates item models', () => {
  const current = { sets: ['old_event'], rewards: { 'the_vault:companion': ['the_vault:dino'] } };
  const granted = grantDeveloperRewards(current, catalog);
  assert.deepEqual(granted.sets, ['old_event', 'new_reward']);
  assert.deepEqual(granted.rewards['the_vault:companion'], ['the_vault:dino']);
  assert.deepEqual(granted.rewards['the_vault:helmet'], catalog[0].sets['the_vault:helmet']);
  assert.deepEqual(current.sets, ['old_event']);
});

test('verified developer UUID gets all live catalog rewards even after a username change', async (t) => {
  const requests = [];
  let writtenSets = null;
  let apiSets = ['old_event'];
  t.mock.method(globalThis, 'fetch', async (url) => {
    const value = String(url);
    requests.push(value);
    if (value.includes('playerdb'))
      return Response.json({
        success: true,
        data: {
          player: { username: 'RenamedDeveloper', raw_id: DEVELOPERS.Douwsky.replaceAll('-', '') },
        },
      });
    if (value.includes('ebs.vaulthunters.gg/battlepass/reward-sets')) return Response.json(catalog);
    if (value.includes('/rewards?minecraft=')) return Response.json({ sets: apiSets, rewards: {} });
    if (value.includes('/users/reward/list')) return Response.json({});
    if (value.includes('/users/reward?uuid=')) return Response.json({ tier: [] });
    throw new Error(`Unexpected request: ${value}`);
  });
  const response = await onRequest({
    request: new Request('https://example.test/api/profile?username=RenamedDeveloper'),
    env: {
      LEADERBOARD_DB: {
        prepare(sql) {
          const statement = {
            bind(...values) {
              if (sql.includes('INSERT INTO leaderboard_players')) writtenSets = values[2];
              return statement;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: [] };
            },
            async first() {
              return null;
            },
          };
          return statement;
        },
      },
    },
  });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.isDeveloper, true);
  assert.deepEqual(profile.sets, ['old_event', 'new_reward']);
  assert.deepEqual(profile.apiRewards.sets, ['old_event']);
  assert.equal(writtenSets, 1);
  assert.deepEqual(profile.rewards['the_vault:companion'], ['the_vault:dino']);
  assert.equal(
    requests.some((url) => url.includes('/rewards?minecraft=')),
    true
  );
  apiSets = [];
  const emptyResponse = await onRequest({
    request: new Request('https://example.test/api/profile?username=RenamedDeveloper'),
    env: {
      LEADERBOARD_DB: {
        prepare(sql) {
          const statement = {
            bind(...values) {
              if (sql.includes('INSERT INTO leaderboard_players')) writtenSets = values[2];
              return statement;
            },
            async run() {
              return { meta: { changes: 1 } };
            },
            async all() {
              return { results: [] };
            },
            async first() {
              return null;
            },
          };
          return statement;
        },
      },
    },
  });
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual((await emptyResponse.json()).apiRewards.sets, []);
  assert.equal(writtenSets, 0);
});

test('developer display name with a different UUID does not receive the override', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const value = String(url);
    assert.equal(value.includes('ebs.vaulthunters.gg'), false);
    if (value.includes('playerdb'))
      return Response.json({
        success: true,
        data: { player: { username: 'Douwsky', raw_id: '00000000000000000000000000000001' } },
      });
    if (value.includes('/users/reward/list')) return Response.json({});
    if (value.includes('/users/reward?uuid=')) return Response.json({ tier: [] });
    if (value.includes('/rewards?minecraft='))
      return Response.json({ sets: ['owned'], rewards: {} });
    throw new Error(`Unexpected request: ${value}`);
  });
  const response = await onRequest({
    request: new Request('https://example.test/api/profile?username=Douwsky'),
    env: {},
  });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.equal(profile.isDeveloper, false);
  assert.deepEqual(profile.sets, ['owned']);
});

test('developer API unlocks appear in snapshots alongside companion progress', async () => {
  const { buildSnapshot } = await import('../workers/leaderboard-snapshots/publish.js');
  const snapshot = buildSnapshot(
    [
      { player_uuid: DEVELOPERS.Douwsky, player_name: 'Developer', sets_unlocked: 7 },
      { player_uuid: 'normal', player_name: 'Normal', sets_unlocked: 10 },
    ],
    [
      {
        streamer_login: 'iskall85',
        twitch_name: 'dev',
        player_name: 'Developer',
        minecraft_uuid: DEVELOPERS.Douwsky,
        season_level: 50,
        vaults_joined: 5,
      },
    ],
    1
  );
  assert.equal(snapshot.manifest.boards.setsUnlocked.total, 2);
  const players = snapshot.objects.find((object) =>
    object.key.endsWith('/setsUnlocked/0.json')
  ).data;
  assert.equal(players[0].playerNickname, 'Normal');
  assert.equal(players[0].rank, 1);
  assert.equal(players[1].playerNickname, 'Developer');
  assert.equal(players[1].rank, 2);
  assert.equal(snapshot.manifest.unlockEligibilityVersion, 2);
  assert.ok(
    snapshot.objects.some(
      (object) =>
        Array.isArray(object.data) && object.data.some((player) => player.twitchName === 'dev')
    )
  );
});

const sqlite = await import('node:sqlite').catch(() => null);
test(
  'developer API rows participate in SQL unlock totals, pagination and ranks',
  { skip: !sqlite },
  async () => {
    const { getLeaderboardPage, getLeaderboardPlacement, buildLeaderboardRecord } =
      await import('../functions/utils/leaderboard.js');
    const database = new sqlite.DatabaseSync(':memory:');
    database.exec(
      `CREATE TABLE leaderboard_players (player_uuid TEXT, player_name TEXT, sets_unlocked INTEGER, vault_hunters_tier TEXT, iskall85_tier TEXT, updated_at TEXT)`
    );
    const insert = database.prepare(
      'INSERT INTO leaderboard_players VALUES (?, ?, ?, NULL, NULL, ?)'
    );
    insert.run(DEVELOPERS.Douwsky, 'Developer', 7, '2026-10-28');
    insert.run('normal1', 'First', 10, '2026-10-28');
    insert.run('normal2', 'Second', 5, '2026-10-28');
    const env = {
      LEADERBOARD_DB: {
        prepare(sql) {
          let args = [];
          const statement = {
            bind(...values) {
              args = [Object.fromEntries(values.map((v, i) => [String(i + 1), v]))];
              return statement;
            },
            async all() {
              return { results: database.prepare(sql).all(...args) };
            },
            async first() {
              return (await statement.all()).results[0];
            },
          };
          return statement;
        },
      },
    };
    try {
      const page = await getLeaderboardPage(env);
      assert.equal(page.total, 3);
      assert.deepEqual(
        page.players.map((player) => player.rank),
        [1, 2, 3]
      );
      assert.equal((await getLeaderboardPage(env, { limit: 1, offset: 1 })).players[0].rank, 2);
      assert.equal((await getLeaderboardPage(env, { targetPlayer: 'Second' })).focusPlayer.rank, 3);
      assert.equal(
        (await getLeaderboardPage(env, { targetPlayer: 'Developer' })).focusPlayer.rank,
        2
      );
      assert.equal(
        (
          await getLeaderboardPlacement(env, {
            playerUUID: DEVELOPERS.Douwsky,
            playerNickname: 'Developer',
          })
        ).rank,
        2
      );
      assert.equal((await getLeaderboardPlacement(env, { playerNickname: 'Second' })).rank, 3);
      assert.equal(
        buildLeaderboardRecord({ playerUUID: DEVELOPERS.Douwsky, sets: ['a'] }).setsUnlocked,
        1
      );
      assert.equal(
        buildLeaderboardRecord({ playerUUID: DEVELOPERS.Douwsky, sets: [] }).setsUnlocked,
        0
      );
    } finally {
      database.close();
    }
  }
);
