export const STATS_FILTERS = ['all', 'joined', 'above10'];
const VAULT_BUCKETS = [
  [0, 0, '0'],
  [1, 4, '1–4'],
  [5, 9, '5–9'],
  [10, 24, '10–24'],
  [25, 49, '25–49'],
  [50, Infinity, '50+'],
];
const BUCKETS = [
  [0, 0, '0'],
  [1, 10, '1–10'],
  [11, 24, '11–24'],
  [25, 49, '25–49'],
  [50, 99, '50–99'],
  [100, Infinity, '100+'],
];
const number = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0);
const average = (values) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const publicPlayer = (row) =>
  row
    ? {
        twitchName: row.twitch_name,
        minecraftName: row.minecraft_name || null,
        name: row.alias || row.twitch_name,
        level: number(row.season_level),
        vaults: number(row.vaults_joined),
      }
    : null;

export function buildStreamerStats(rows, generatedAt) {
  const groups = new Map();
  // One companion per Twitch account per streamer; never merge by skin or alias.
  for (const row of rows) {
    const streamer = String(row.streamer_login || '').toLowerCase();
    const login = String(row.twitch_name || '').toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(streamer) || !/^[a-z0-9_]{1,25}$/.test(login)) continue;
    if (!groups.has(streamer)) groups.set(streamer, new Map());
    groups.get(streamer).set(login, row);
  }
  const filters = {};
  for (const filter of STATS_FILTERS) {
    const accounts = new Map();
    const streamers = [...groups]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([login, roster]) => {
        const selected = [...roster.values()].filter((row) =>
          filter === 'joined'
            ? number(row.vaults_joined) > 0
            : filter === 'above10'
              ? number(row.season_level) > 10
              : true
        );
        accounts.set(login, new Set(selected.map((row) => row.twitch_name.toLowerCase())));
        const levels = selected.map((row) => number(row.season_level));
        const vaults = selected.map((row) => number(row.vaults_joined));
        const byLevel = [...selected].sort(
          (a, b) =>
            number(b.season_level) - number(a.season_level) ||
            number(b.vaults_joined) - number(a.vaults_joined) ||
            a.twitch_name.localeCompare(b.twitch_name)
        );
        const byVaults = [...selected].sort(
          (a, b) =>
            number(b.vaults_joined) - number(a.vaults_joined) ||
            number(b.season_level) - number(a.season_level) ||
            a.twitch_name.localeCompare(b.twitch_name)
        );
        const totalVaults = vaults.reduce((a, b) => a + b, 0);
        const participated = vaults.filter((value) => value > 0).length;
        return {
          login,
          rosterCount: roster.size,
          count: selected.length,
          updatedAt:
            [...roster.values()].reduce(
              (latest, row) => (row.updated_at > latest ? row.updated_at : latest),
              ''
            ) || null,
          averageLevel: average(levels),
          medianLevel: median(levels),
          averageVaults: average(vaults),
          medianVaults: median(vaults),
          totalVaults,
          participated,
          neverJoined: selected.length - participated,
          participationRate: selected.length ? participated / selected.length : null,
          topTenAverage: average(byLevel.slice(0, 10).map((row) => number(row.season_level))),
          topTenCount: Math.min(selected.length, 10),
          topTenPercentVaultShare: totalVaults
            ? byVaults
                .slice(0, Math.ceil(selected.length / 10))
                .reduce((sum, row) => sum + number(row.vaults_joined), 0) / totalVaults
            : null,
          highestLevel: publicPlayer(byLevel[0]),
          mostVaults: publicPlayer(byVaults[0]),
          highestWithoutVault: publicPlayer(byLevel.find((row) => number(row.vaults_joined) === 0)),
          milestones: [10, 25, 50, 100].map((level) => ({
            level,
            count: levels.filter((value) => value >= level).length,
          })),
          experienced: [10, 25, 50, 100].map((runs) => ({
            runs,
            count: vaults.filter((value) => value >= runs).length,
          })),
          distribution: BUCKETS.map(([min, max, label]) => ({
            label,
            count: levels.filter((level) => level >= min && level <= max).length,
          })),
          vaultDistribution: VAULT_BUCKETS.map(([min, max, label]) => ({
            label,
            count: vaults.filter((runs) => runs >= min && runs <= max).length,
          })),
        };
      });
    const overlaps = streamers.map((a) =>
      streamers.map((b) => {
        const right = accounts.get(b.login);
        return [...accounts.get(a.login)].filter((login) => right.has(login)).length;
      })
    );
    filters[filter] = {
      streamers,
      overlaps,
      uniqueAccounts: new Set([...accounts.values()].flatMap((set) => [...set])).size,
    };
  }
  return { schema: 1, generatedAt, filters };
}
