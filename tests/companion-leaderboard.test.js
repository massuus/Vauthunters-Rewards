import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCompanionPlayerStats,
  normalizeCompanionPlayer,
  parseCompanionLeaderboardParams,
  resolveCompanionMinecraftIdentities,
} from '../functions/utils/companion-leaderboard.js';

test('uses the selected skin as the Minecraft leaderboard identity', () => {
  assert.deepEqual(
    normalizeCompanionPlayer({
      name: 'Massuus',
      alias: 'Massuus Live',
      skin: 'MinecraftMassuus',
      seasonLevel: 31,
      vaultsJoined: 12,
    }),
    {
      twitchName: 'massuus',
      playerName: 'MinecraftMassuus',
      alias: 'Massuus Live',
      seasonLevel: 31,
      vaultsJoined: 12,
    }
  );
});

test('allows a manual player without a Twitch name', () => {
  assert.deepEqual(
    normalizeCompanionPlayer({ playerName: 'Massuus', seasonLevel: 9, vaultsJoined: 3 }),
    {
      twitchName: 'massuus',
      playerName: 'Massuus',
      alias: null,
      seasonLevel: 9,
      vaultsJoined: 3,
    }
  );
});

test('rejects an invalid Minecraft skin username', () => {
  assert.equal(normalizeCompanionPlayer({ name: 'massuus', skin: 'not a minecraft name' }), null);
});

test('parses companion leaderboard metric and streamer', () => {
  const url = new URL(
    'https://example.test/api/leaderboard?metric=vaultsJoined&streamer=Iskall85&limit=20&offset=5'
  );
  assert.deepEqual(parseCompanionLeaderboardParams(url), {
    streamer: 'iskall85',
    metric: 'vaultsJoined',
    limit: 20,
    offset: 5,
    targetPlayer: '',
  });
});

test('returns one companion progress record per streamer for a linked player', async () => {
  const queryRows = [
    {
      streamer_login: 'iskall85',
      twitch_name: 'massuus',
      alias: 'Massuus',
      season_level: 53,
      vaults_joined: 7,
      updated_at: '2026-09-09T12:00:00.000Z',
    },
    {
      streamer_login: 'iskall85',
      twitch_name: 'an-old-account',
      alias: 'Old alias',
      season_level: 12,
      vaults_joined: 2,
      updated_at: '2026-08-01T12:00:00.000Z',
    },
    {
      streamer_login: 'mayaicefire',
      twitch_name: 'massuus',
      alias: 'Massuus',
      season_level: 21,
      vaults_joined: 4,
      updated_at: '2026-09-08T12:00:00.000Z',
    },
  ];
  const db = {
    prepare(sql) {
      if (sql.trimStart().startsWith('SELECT streamer_login')) {
        return {
          bind(minecraftUUID, twitchName) {
            assert.equal(minecraftUUID, '18f179ee-3dba-4ce2-8650-8ef714f44e80');
            assert.equal(twitchName, 'massuus');
            return { all: async () => ({ results: queryRows }) };
          },
        };
      }
      return { run: async () => ({ success: true }) };
    },
  };

  assert.deepEqual(
    await getCompanionPlayerStats(
      { LEADERBOARD_DB: db },
      {
        minecraftUUID: '18f179ee3dba4ce286508ef714f44e80',
        twitchName: 'Massuus',
      }
    ),
    [
      {
        streamer: 'iskall85',
        twitchName: 'massuus',
        alias: 'Massuus',
        seasonLevel: 53,
        vaultsJoined: 7,
        updatedAt: '2026-09-09T12:00:00.000Z',
      },
      {
        streamer: 'mayaicefire',
        twitchName: 'massuus',
        alias: 'Massuus',
        seasonLevel: 21,
        vaultsJoined: 4,
        updatedAt: '2026-09-08T12:00:00.000Z',
      },
    ]
  );
});

test('resolves and stores a real Minecraft identity from a Twitch username', async () => {
  const updates = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          if (sql.includes('SELECT twitch_name, minecraft_uuid, minecraft_name')) {
            assert.deepEqual(values, ['csabbesz']);
            return { all: async () => ({ results: [] }) };
          }
          if (sql.includes('UPDATE companion_leaderboard_players')) {
            return {
              run: async () => {
                updates.push(values);
                return { meta: { changes: 1 } };
              },
            };
          }
          return { run: async () => ({ success: true }) };
        },
        run: async () => ({ success: true }),
      };
    },
  };
  const minecraftId = '18f179ee-3dba-4ce2-8650-8ef714f44e80';
  const fetchJsonFn = async (url) => {
    if (url.includes('twitchUsername=')) return { data: { minecraftId } };
    return {
      data: {
        success: true,
        data: { player: { raw_id: minecraftId.replaceAll('-', ''), username: 'CsaBa' } },
      },
    };
  };

  assert.deepEqual(
    await resolveCompanionMinecraftIdentities(
      { LEADERBOARD_DB: db },
      { twitchNames: ['CsaBBeSz'], fetchJsonFn }
    ),
    {
      received: 1,
      processed: 1,
      resolved: 1,
      existing: 0,
      missing: 0,
      failed: 0,
      skipped: 0,
    }
  );
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].slice(0, 2), [minecraftId, 'CsaBa']);
  assert.equal(updates[0][3], 'csabbesz');
});

test('reports an unlinked Twitch account without guessing from its selected skin', async () => {
  const db = {
    prepare(sql) {
      return {
        bind() {
          if (sql.includes('SELECT twitch_name, minecraft_uuid, minecraft_name')) {
            return { all: async () => ({ results: [] }) };
          }
          return { run: async () => ({ meta: { changes: 0 } }) };
        },
        run: async () => ({ success: true }),
      };
    },
  };

  const result = await resolveCompanionMinecraftIdentities(
    { LEADERBOARD_DB: db },
    {
      twitchNames: ['not_linked'],
      fetchJsonFn: async () => ({ data: {} }),
    }
  );

  assert.equal(result.missing, 1);
  assert.equal(result.resolved, 0);
});
