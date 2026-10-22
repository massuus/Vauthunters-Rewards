import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStreamerStats } from '../functions/utils/streamer-stats.js';
import { buildSnapshot } from '../workers/leaderboard-snapshots/publish.js';
import { onRequest } from '../functions/api/streamer-stats.js';
import { renderLevelVaultCharts } from '../public/js/components/special-pages/level-vault-chart.js';
const row = (streamer, twitch, level, vaults, alias = null) => ({
  streamer_login: streamer,
  twitch_name: twitch,
  season_level: level,
  vaults_joined: vaults,
  alias,
  player_name: 'shared_skin',
  updated_at: '2026-10-15T12:00:00Z',
});
const rows = [
  row('iskall85', 'alpha', 0, 0),
  row('iskall85', 'beta', 10, 2),
  row('iskall85', 'gamma', 11, 4),
  row('iskall85', 'delta', 99, 10),
  row('hoy_82', 'beta', 50, 0, 'Same alias'),
  row('hoy_82', 'other', 2, 0, 'Same alias'),
];

test('level-vault points aggregate matching companions and respect filters', () => {
  const { filters } = buildStreamerStats(
    [row('one', 'alpha', 12, 3), row('one', 'beta', 12, 3), row('one', 'gamma', 10, 0)],
    ''
  );
  assert.deepEqual(filters.all.streamers[0].levelVaultPoints, [
    { level: 10, vaults: 0, count: 1 },
    { level: 12, vaults: 3, count: 2 },
  ]);
  for (const filter of ['joined', 'above10']) {
    assert.deepEqual(filters[filter].streamers[0].levelVaultPoints, [
      { level: 12, vaults: 3, count: 2 },
    ]);
  }
  const chart = renderLevelVaultCharts(
    filters.all.streamers,
    (s) => s,
    (s) => s
  );
  assert.match(chart, /Level 12, 3 vaults joined: 2 companions/);
  assert.doesNotMatch(chart, /View graph data/);
  assert.doesNotMatch(chart, /NaN|Infinity/);
  const zero = buildStreamerStats([row('one', 'alpha', 0, 0)], '').filters.all;
  assert.doesNotMatch(
    renderLevelVaultCharts(
      zero.streamers,
      (s) => s,
      (s) => s
    ),
    /NaN|Infinity/
  );
  assert.match(
    renderLevelVaultCharts(
      [{ count: 1 }],
      (s) => s,
      (s) => s
    ),
    /next statistics update/
  );
});

test('stats calculate means, medians, milestones, participation and distinct-account overlaps', () => {
  const data = buildStreamerStats(rows, '2026-10-15T12:00:00Z');
  const all = data.filters.all;
  const iskall = all.streamers.find((s) => s.login === 'iskall85');
  assert.equal(iskall.count, 4);
  assert.equal(iskall.averageLevel, 30);
  assert.equal(iskall.medianLevel, 10.5);
  assert.equal(iskall.averageVaults, 4);
  assert.equal(iskall.medianVaults, 3);
  assert.equal(iskall.participationRate, 0.75);
  assert.equal(iskall.totalVaults, 16);
  assert.equal(iskall.highestLevel.twitchName, 'delta');
  assert.equal(iskall.mostVaults.twitchName, 'delta');
  assert.equal(iskall.highestWithoutVault.twitchName, 'alpha');
  assert.equal(iskall.topTenAverage, 30);
  assert.equal(iskall.topTenCount, 4);
  assert.equal(iskall.topTenPercentVaultShare, 10 / 16);
  assert.deepEqual(
    iskall.milestones.map((s) => s.count),
    [3, 1, 1, 0]
  );
  assert.deepEqual(
    iskall.distribution.map((s) => s.count),
    [1, 1, 1, 0, 1, 0]
  );
  assert.deepEqual(all.overlaps, [
    [2, 1],
    [1, 4],
  ]);
  assert.equal(all.uniqueAccounts, 5);
});

test('filters exclude level 10, keep roster denominators and handle empty groups without NaN', () => {
  const { filters } = buildStreamerStats(rows, '2026-10-15T12:00:00Z');
  const above = filters.above10.streamers.find((s) => s.login === 'iskall85');
  assert.equal(above.count, 2);
  assert.equal(above.rosterCount, 4);
  assert.equal(above.averageLevel, 55);
  assert.deepEqual(filters.above10.overlaps, [
    [1, 0],
    [0, 2],
  ]);
  const joined = filters.joined.streamers.find((s) => s.login === 'hoy_82');
  assert.equal(joined.count, 0);
  assert.equal(joined.rosterCount, 2);
  assert.equal(joined.averageLevel, null);
  assert.equal(joined.medianLevel, null);
  assert.equal(joined.participationRate, null);
  assert.equal(joined.highestLevel, null);
  assert.equal(joined.topTenPercentVaultShare, null);
  assert.equal(JSON.stringify(filters).includes('NaN'), false);
  assert.deepEqual(buildStreamerStats([], '').filters.all.streamers, []);
});

test('overlap matches Twitch accounts case-insensitively, never aliases or skins', () => {
  const { filters } = buildStreamerStats(
    [
      row('one', 'ALPHA', 1, 1, 'same'),
      row('two', 'alpha', 2, 2, 'different'),
      row('two', 'beta', 2, 2, 'same'),
    ],
    ''
  );
  assert.deepEqual(filters.all.overlaps, [
    [1, 1],
    [1, 2],
  ]);
  assert.equal(filters.all.uniqueAccounts, 2);
});

test('vault distribution includes each boundary once and follows companion filters', () => {
  const runs = [0, 1, 4, 5, 9, 10, 24, 25, 49, 50];
  const { filters } = buildStreamerStats(
    runs.map((vaults, i) => row('iskall85', `player${i}`, i % 2 ? 11 : 10, vaults)),
    ''
  );
  const counts = (filter) =>
    filters[filter].streamers[0].vaultDistribution.map((bucket) => bucket.count);
  assert.deepEqual(counts('all'), [1, 2, 2, 2, 2, 1]);
  assert.deepEqual(counts('joined'), [0, 2, 2, 2, 2, 1]);
  assert.deepEqual(counts('above10'), [0, 1, 1, 1, 1, 1]);
  for (const filter of Object.values(filters)) {
    const streamer = filter.streamers[0];
    assert.equal(
      streamer.vaultDistribution.reduce((sum, bucket) => sum + bucket.count, 0),
      streamer.count
    );
  }
});

test('stats API reads only manifest and precomputed snapshot, never D1 or roster chunks', async () => {
  const snapshot = buildSnapshot([], rows, 1);
  const objects = new Map(snapshot.objects.map((o) => [o.key, o.data]));
  objects.set('leaderboards/v1/current.json', snapshot.manifest);
  const reads = [];
  const response = await onRequest({
    request: new Request('https://example.test/api/streamer-stats'),
    env: {
      LEADERBOARD_SNAPSHOTS: {
        async get(key) {
          reads.push(key);
          const data = objects.get(key);
          return data
            ? {
                size: 1000,
                async json() {
                  return data;
                },
              }
            : null;
        },
      },
      LEADERBOARD_DB: {
        prepare() {
          throw new Error('No D1 reads allowed');
        },
      },
    },
  });
  assert.equal(response.status, 200);
  const stats = await response.json();
  assert.deepEqual(stats, buildStreamerStats(rows, snapshot.manifest.generatedAt));
  assert.equal(reads.length, 2);
  assert.ok(reads[1].endsWith('/streamer-stats.json'));
  assert.equal(
    (
      await onRequest({
        request: new Request('https://example.test/api/streamer-stats', { method: 'POST' }),
        env: {},
      })
    ).status,
    405
  );
  assert.equal(
    (await onRequest({ request: new Request('https://example.test/api/streamer-stats'), env: {} }))
      .status,
    503
  );
});
