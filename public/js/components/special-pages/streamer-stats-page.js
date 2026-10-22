import { renderLevelVaultCharts } from './level-vault-chart.js';

const NAMES = {
  iskall85: 'Iskall85',
  hoy_82: 'Hoy',
  therealhellfirem4ge: 'Hellfirem4ge',
  linahun: 'Lina',
  mastercwg: 'MasterCWG',
  mayaicefire: 'Maya',
  stressmonstah: 'Stressmonster',
};
const GROUPS = [
  ['all', 'All companions'],
  ['joined', 'At least one vault joined'],
  ['above10', 'Above level 10'],
];
const SORTS = [
  ['averageLevel', 'Average level'],
  ['medianLevel', 'Median level'],
  ['count', 'Companion count'],
  ['averageVaults', 'Average vaults joined'],
  ['totalVaults', 'Total participations'],
  ['participationRate', 'Participation rate'],
  ['topTenAverage', 'Top 10 average level'],
];
export const isStreamerStatsQuery = (value) =>
  ['stats', 'streamer stats', 'streamerstats'].includes(String(value).trim().toLowerCase());
const numeric = (value, digits = 0) =>
  value === null || value === undefined
    ? '—'
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
const percent = (value) =>
  value === null || value === undefined ? '—' : `${numeric(value * 100, 1)}%`;
const name = (login) => NAMES[login] || login;
const board = (login, metric = 'seasonLevel') =>
  `?leaderboard=&metric=${metric}&streamer=${encodeURIComponent(login)}`;
const playerUrl = (player) =>
  player.minecraftName
    ? `?user=${encodeURIComponent(player.minecraftName)}`
    : `?twitchUsername=${encodeURIComponent(player.twitchName)}`;

export async function renderStreamerStatsPage(
  container,
  setFavicon,
  setMetaDescription,
  closeOpenModal,
  updateQueryString,
  escapeHtml,
  defaultFavicon
) {
  closeOpenModal();
  document.title = 'Streamer Stats · Vault Hunters Rewards';
  setMetaDescription(
    'Compare Vault Hunters companion levels, vault participation, milestones, and community overlap.'
  );
  setFavicon(defaultFavicon);
  const params = new URLSearchParams(window.location.search);
  let group = GROUPS.some(([id]) => id === params.get('group')) ? params.get('group') : 'all';
  let sort = SORTS.some(([id]) => id === params.get('sort')) ? params.get('sort') : 'averageLevel';
  let ascending = params.get('order') === 'asc';
  const syncUrl = () =>
    updateQueryString(`stats&group=${group}&sort=${sort}&order=${ascending ? 'asc' : 'desc'}`);
  syncUrl();
  container.classList.remove('hidden');
  container.innerHTML = `<section class="streamer-stats"><header class="streamer-stats__intro"><span class="streamer-stats__eyebrow">The companion community</span><h2>Streamer Stats</h2><p>A different view of the vault. Compare companions across streamers, celebrate their strongest players, and see where communities meet.</p></header><p role="status">Gathering companion statistics…</p></section>`;
  const root = container.firstElementChild;
  try {
    const response = await fetch('/api/streamer-stats');
    if (!response.ok) throw new Error('Stats unavailable');
    const data = await response.json();
    if (!root.isConnected) return;
    if (!data.filters?.all || !data.filters?.joined || !data.filters?.above10)
      throw new Error('Invalid stats');
    root.querySelector('[role="status"]').remove();
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="streamer-stats__controls"><div class="streamer-stats__groups" role="group" aria-label="Companions to compare">${GROUPS.map(([id, label]) => `<button type="button" data-stats-group="${id}" aria-pressed="${group === id}">${label}</button>`).join('')}</div><div class="streamer-stats__sort"><label>Compare by <select data-stats-sort>${SORTS.map(([id, label]) => `<option value="${id}"${sort === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" data-stats-order aria-label="Reverse sort order"></button></div></div><p class="streamer-stats__status" data-stats-status role="status"></p><div data-stats-content></div><p class="streamer-stats__footnote">These are collected companion records, so counts can differ from the in-game companion list. Levels are companion season levels, not eternal level. Total participations count companions joining vaults, not unique vault runs. Averages and charts use the selected group; overlap matches Twitch accounts, never skins or aliases. Snapshot: <time datetime="${escapeHtml(data.generatedAt)}">${escapeHtml(new Date(data.generatedAt).toLocaleString())}</time>. Data is refreshed through the leaderboard snapshot cycle.</p>`
    );
    const playerLink = (player) =>
      player ? `<a href="${escapeHtml(playerUrl(player))}">${escapeHtml(player.name)}</a>` : '—';
    const streamerLink = (login) =>
      `<a href="${escapeHtml(board(login))}">${escapeHtml(name(login))}</a>`;
    const table = (head, rows, caption) =>
      `<div class="streamer-stats__scroll" tabindex="0" role="region" aria-label="${caption}"><table><caption>${caption}</caption><thead><tr>${head.map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    const render = () => {
      const sortControls = root.querySelector('.streamer-stats__sort');
      const selected = data.filters[group];
      const streamers = [...selected.streamers].sort((a, b) => {
        if (a[sort] === null || a[sort] === undefined || b[sort] === null || b[sort] === undefined)
          return a[sort] === null || a[sort] === undefined
            ? b[sort] === null || b[sort] === undefined
              ? a.login.localeCompare(b.login)
              : 1
            : -1;
        return (
          (ascending ? a[sort] - b[sort] : b[sort] - a[sort]) || a.login.localeCompare(b.login)
        );
      });
      const count = streamers.reduce((sum, row) => sum + row.count, 0);
      root.querySelector('[data-stats-status]').textContent =
        `${numeric(count)} companions across ${streamers.length} streamers · ${numeric(selected.uniqueAccounts)} distinct Twitch accounts · ${GROUPS.find(([id]) => id === group)[1]}${group === 'above10' ? ' (level 11+)' : ''}`;
      root.querySelector('[data-stats-order]').textContent = ascending
        ? 'Low → High'
        : 'High → Low';
      root
        .querySelectorAll('[data-stats-group]')
        .forEach((button) =>
          button.setAttribute('aria-pressed', String(button.dataset.statsGroup === group))
        );
      if (!count) {
        root.querySelector('[data-stats-content]').innerHTML =
          '<section class="streamer-stats__section"><h3>Compare companions</h3><div data-stats-sort-slot></div><p class="streamer-stats__empty">No companions in this group yet. Try another filter.</p></section>';
        root.querySelector('[data-stats-sort-slot]').append(sortControls);
        return;
      }
      const winner = (value) =>
        streamers
          .filter((row) => row.count)
          .sort((a, b) => value(b) - value(a) || a.login.localeCompare(b.login))[0];
      const best = winner((row) => row.highestLevel?.level || 0);
      const average = winner((row) => row.averageLevel);
      const runs = winner((row) => row.mostVaults?.vaults || 0);
      const roster = winner((row) => row.count);
      const card = (label, value, detail, extra) =>
        `<article class="streamer-stats__card"><span>${label}</span><strong>${value}</strong><div>${detail}</div><small>${extra}</small></article>`;
      const cards =
        card(
          'Highest companion level',
          numeric(best.highestLevel.level),
          playerLink(best.highestLevel),
          streamerLink(best.login)
        ) +
        card(
          'Highest average level',
          numeric(average.averageLevel, 1),
          streamerLink(average.login),
          `${numeric(average.count)} selected companions`
        ) +
        card(
          'Most vaults joined',
          numeric(runs.mostVaults.vaults),
          playerLink(runs.mostVaults),
          streamerLink(runs.login)
        ) +
        card(
          'Most companions in this group',
          numeric(roster.count),
          streamerLink(roster.login),
          `${numeric(roster.rosterCount)} companions`
        );
      const rows = streamers
        .map(
          (row) =>
            `<tr><th scope="row">${streamerLink(row.login)}<small>${row.updatedAt ? escapeHtml(new Date(row.updatedAt).toLocaleDateString()) : 'Update unknown'}</small></th><td>${numeric(row.count)}<small>of ${numeric(row.rosterCount)}</small></td><td>${numeric(row.averageLevel, 1)}</td><td>${numeric(row.medianLevel, 1)}</td><td>${numeric(row.topTenAverage, 1)}<small>${row.topTenCount} companions</small></td><td>${numeric(row.averageVaults, 1)}</td><td>${numeric(row.totalVaults)}</td><td>${percent(row.participationRate)}<small>${numeric(row.participated)} joined a vault</small></td></tr>`
        )
        .join('');
      const comparison = table(
        [
          'Streamer / last collected',
          'Companions',
          'Average level',
          'Median level',
          'Top 10 avg. level',
          'Avg. vaults joined',
          'Total participations',
          'Participation rate',
        ],
        rows,
        'Companion comparison'
      );
      const renderDistributions = (field, unit) =>
        selected.streamers
          .map(
            (row) =>
              `<article class="streamer-stats__distribution"><div>${streamerLink(row.login)}<span>${numeric(row.count)} companions</span></div><div class="streamer-stats__bar" role="img" aria-label="${escapeHtml(name(row.login))}: ${row[field].map((bucket) => `${unit} ${bucket.label}: ${bucket.count}`).join('; ')}">${row[
                field
              ]
                .filter((bucket) => bucket.count)
                .map(
                  (bucket) =>
                    `<span data-bucket="${row[field].indexOf(bucket)}" style="flex-grow:${bucket.count}" title="${unit} ${bucket.label}: ${numeric(bucket.count)} (${percent(bucket.count / row.count)})"></span>`
                )
                .join(
                  ''
                )}</div><p>${row[field].map((bucket) => `<span><i data-bucket="${row[field].indexOf(bucket)}"></i>${bucket.label}: <b>${numeric(bucket.count)}</b></span>`).join('')}</p></article>`
          )
          .join('');
      const distributions = renderDistributions('distribution', 'Level');
      const vaultDistributions = selected.streamers.every((row) =>
        Array.isArray(row.vaultDistribution)
      )
        ? renderDistributions('vaultDistribution', 'Vaults joined')
        : '<p>Vault participation charts will appear after the next statistics update.</p>';
      const original = selected.streamers;
      const overlaps = table(
        ['Streamer', ...original.map((row) => escapeHtml(name(row.login)))],
        original
          .map(
            (row, i) =>
              `<tr><th scope="row">${streamerLink(row.login)}</th>${selected.overlaps[i].map((value, j) => `<td${i === j ? ' class="streamer-stats__diagonal"' : ''} title="${escapeHtml(name(row.login))} / ${escapeHtml(name(original[j].login))}: ${numeric(value)} accounts">${numeric(value)}</td>`).join('')}</tr>`
          )
          .join(''),
        'Shared companion accounts'
      );
      const details = table(
        [
          'Streamer',
          'Level milestones',
          'Experienced companions',
          'Never joined',
          'Top 10% participation share',
          'Highest level',
          'Most vaults',
          'Highest without a vault',
        ],
        streamers
          .map(
            (row) =>
              `<tr><th scope="row">${streamerLink(row.login)}</th><td>${row.milestones.map((m) => `<span class="streamer-stats__detail">${m.level}+: ${numeric(m.count)}</span>`).join('')}</td><td>${row.experienced.map((m) => `<span class="streamer-stats__detail">${m.runs}+ vaults: ${numeric(m.count)}</span>`).join('')}</td><td>${numeric(row.neverJoined)}</td><td>${percent(row.topTenPercentVaultShare)}</td><td>${playerLink(row.highestLevel)}<small>${row.highestLevel ? `Level ${numeric(row.highestLevel.level)}` : ''}</small></td><td>${playerLink(row.mostVaults)}<small>${row.mostVaults ? `${numeric(row.mostVaults.vaults)} vaults` : ''}</small></td><td>${playerLink(row.highestWithoutVault)}<small>${row.highestWithoutVault ? `Level ${numeric(row.highestWithoutVault.level)}` : ''}</small></td></tr>`
          )
          .join(''),
        'Milestones and companion highlights'
      );
      root.querySelector('[data-stats-content]').innerHTML =
        `<div class="streamer-stats__cards">${cards}</div><section class="streamer-stats__section"><h3>Compare companions</h3><p>Median shows the typical companion. Participation means at least one recorded vault joined. Use “Compare by” to reorder the table.</p><div data-stats-sort-slot></div>${comparison}</section><section class="streamer-stats__section"><h3>From first steps to vault veterans</h3><p>Companion season levels, grouped into bands. The numbers below each bar show the exact counts.</p><div class="streamer-stats__distributions">${distributions}</div></section><section class="streamer-stats__section"><h3>From first vault to regular adventurer</h3><p>Companions grouped by how many vaults they have joined. The numbers below each bar show the exact companion counts.</p><div class="streamer-stats__distributions" data-vault-distributions>${vaultDistributions}</div></section><section class="streamer-stats__section"><h3>Companion level vs vaults joined</h3><p>Each dot shows companion season level against vaults joined. Larger dots represent more companions with the same values. Each graph uses axes fitted to that streamer?s data.</p><div class="streamer-stats__charts">${renderLevelVaultCharts(selected.streamers, escapeHtml, name)}</div></section><section class="streamer-stats__section"><h3>Where communities meet</h3><p>Accounts with companions in both companion groups. The diagonal shows each streamer’s own selected accounts.</p>${overlaps}</section><details class="streamer-stats__section"><summary>Milestones & more companion stats</summary><p>The top 10% share shows how much vault participation comes from the busiest tenth of each selected companion group. “Top 10” averages use fewer companions when fewer than ten qualify.</p>${details}</details>`;
      root.querySelector('[data-stats-sort-slot]').append(sortControls);
    };
    root.querySelectorAll('[data-stats-group]').forEach((button) =>
      button.addEventListener('click', () => {
        group = button.dataset.statsGroup;
        syncUrl();
        render();
      })
    );
    root.querySelector('[data-stats-sort]').addEventListener('change', (event) => {
      sort = event.target.value;
      syncUrl();
      render();
    });
    root.querySelector('[data-stats-order]').addEventListener('click', () => {
      ascending = !ascending;
      syncUrl();
      render();
    });
    render();
  } catch {
    if (root.isConnected)
      root.insertAdjacentHTML(
        'beforeend',
        '<p role="alert">We couldn’t load streamer statistics. Please refresh and try again shortly.</p>'
      );
    root.querySelector('[role="status"]')?.remove();
  }
}
