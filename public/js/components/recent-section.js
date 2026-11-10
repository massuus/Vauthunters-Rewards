// Recent users section rendering and handling

import { loadTemplate, renderTemplate } from '../loaders/template-loader.js';
import {
  recentContainer,
  usernameInput,
  form,
  proxiedImageUrl,
  DEFAULT_FAVICON,
  resultContainer,
} from '../utils/dom-utils.js';
import { getRecentUsers } from '../utils/storage-manager.js';
import { escapeHtml } from '../features/reward-utils.js';
import { getBestPatreonTier } from '../utils/tier-utils.js';
import { fetchLeaderboardPage } from '../features/leaderboard.js';
import { showHomeDashboard, hideHomeDashboard } from './home-dashboard.js';

const HOME_LEADERBOARD_LIMIT = 5;
let renderGeneration = 0;

export function cancelRecentSectionRender() {
  renderGeneration += 1;
  hideHomeDashboard();
}

/**
 * Render the recent users section
 */
export async function renderRecentSection({ signal } = {}) {
  if (!recentContainer) return;
  const generation = ++renderGeneration;
  const query = usernameInput.value.trim();
  const isCurrent = () =>
    !signal?.aborted && generation === renderGeneration && query === usernameInput.value.trim();
  const items = getRecentUsers();

  const shouldShowHomeBlocks =
    !usernameInput.value.trim() && resultContainer.classList.contains('hidden');
  if (shouldShowHomeBlocks) showHomeDashboard();
  else hideHomeDashboard();
  const leaderboardSection = shouldShowHomeBlocks ? await renderHomeLeaderboardSection() : '';
  if (!isCurrent()) return;

  if (!items.length && !leaderboardSection) {
    recentContainer.classList.add('hidden');
    recentContainer.innerHTML = '';
    return;
  }
  const buttons = items
    .map((u) => {
      const img = proxiedImageUrl(u.head || DEFAULT_FAVICON);
      const safe = escapeHtml(u.name);
      const bestTier = getBestPatreonTier(u.tier || []);
      const nameStyle = bestTier ? `color: ${bestTier.color};` : '';
      return `<button class="recent-item" type="button" data-name="${safe}"><img src="${img}" alt="${safe}'s head" width="28" height="28"><span style="${nameStyle}">${safe}</span></button>`;
    })
    .join('');
  const template = await loadTemplate(
    shouldShowHomeBlocks ? 'home-recent-section' : 'recent-section'
  );
  if (!isCurrent()) return;
  recentContainer.innerHTML = renderTemplate(template, {
    buttons,
    leaderboardSection,
  });
  recentContainer.classList.remove('hidden');
  bindRecentHandlers();
}

async function renderHomeLeaderboardSection() {
  const boards = [
    {
      title: 'Most reward sets',
      metric: 'setsUnlocked',
      note: 'Top unlock leaderboard',
      link: '?leaderboard',
      action: 'Full leaderboard',
    },
    {
      title: 'Highest companion levels',
      metric: 'seasonLevel',
      note: "On Iskall85's stream",
      link: '?leaderboard&metric=seasonLevel&streamer=iskall85',
      action: 'Explore other streamers',
    },
    {
      title: 'Combined companion levels',
      metric: 'combinedLevel',
      note: 'Each player, across all streamers',
      link: '?leaderboard&metric=combinedLevel',
      action: 'View all companion stats',
    },
  ];
  const results = await Promise.allSettled(
    boards.map((board) =>
      fetchLeaderboardPage({ metric: board.metric, limit: HOME_LEADERBOARD_LIMIT })
    )
  );
  return `<div class="home-rankings">${boards
    .map((board, index) => {
      const result = results[index];
      const players = result.status === 'fulfilled' ? result.value.players : [];
      const rows = players
        .map((player) => {
          const name = escapeHtml(player.playerNickname);
          const identity = escapeHtml(
            player.twitchName ? `twitch:${player.twitchName}` : player.playerNickname
          );
          const avatar = proxiedImageUrl(
            `https://mc-heads.net/avatar/${encodeURIComponent(player.minecraftUUID || player.playerUUID || player.skinName || player.playerNickname)}/64`
          );
          const score =
            board.metric === 'setsUnlocked'
              ? `${player.setsUnlocked} sets`
              : `${player.seasonLevel.toLocaleString()} levels`;
          return `<button class="recent-item home-ranking__row" type="button" data-name="${identity}" title="Open ${name}"><span class="home-ranking__rank">#${player.rank}</span><img src="${avatar}" alt="" width="32" height="32" loading="lazy"><span class="home-ranking__player"><span class="home-ranking__name">${name}</span><strong>${score}</strong></span></button>`;
        })
        .join('');
      const actionLink = board.metric === 'combinedLevel' ? '?stats' : board.link;
      return `<section class="home-ranking"><header><h3>${board.title}</h3><p>${board.note}</p></header><div class="home-ranking__rows">${rows || `<p class="home-empty">${result.status === 'rejected' ? 'Ranking unavailable. Please try again later.' : 'No players ranked yet.'}</p>`}</div><div class="home-ranking__actions"><a class="home-button" href="${actionLink}">${board.action}</a></div></section>`;
    })
    .join('')}</div>`;
}

/**
 * Bind click handlers to recent user buttons
 */
function bindRecentHandlers() {
  if (!recentContainer) return;
  recentContainer.querySelectorAll('button.recent-item[data-name]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name') || '';
      if (!name) return;
      usernameInput.value = name;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });

  recentContainer.querySelectorAll('button.recent-item[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const page = btn.getAttribute('data-page') || '';
      if (!page) return;
      usernameInput.value = page;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });
}
