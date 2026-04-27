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

const HOME_LEADERBOARD_LIMIT = 5;

function renderHomeTierBadge(label, modifier) {
  const safeLabel = String(label || '').trim();

  if (!safeLabel) {
    return `<span class="leaderboard-tier leaderboard-tier--${modifier} leaderboard-tier--empty">None</span>`;
  }

  return `<span class="leaderboard-tier leaderboard-tier--${modifier}">${escapeHtml(safeLabel)}</span>`;
}

/**
 * Render the recent users section
 */
export async function renderRecentSection() {
  if (!recentContainer) return;
  const items = getRecentUsers();

  const shouldShowHomeBlocks = shouldShowPagesSection();
  const leaderboardSection = shouldShowHomeBlocks ? await renderHomeLeaderboardSection() : '';

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
  const pagesSection = shouldShowPagesSection()
    ? `
      <h3 class="recent-title">Pages</h3>
      <div class="recent-grid">
        <button class="recent-item" type="button" data-page="all">All Rewards</button>
        <button class="recent-item" type="button" data-page="codes">Reward Codes</button>
        <button class="recent-item" type="button" data-page="servers">Official Servers</button>
        <button class="recent-item" type="button" data-page="leaderboard">Unlock Leaderboard</button>
      </div>
    `
    : '';

  const template = await loadTemplate('recent-section');
  recentContainer.innerHTML = renderTemplate(template, {
    buttons,
    pagesSection,
    leaderboardSection,
  });
  recentContainer.classList.remove('hidden');
  bindRecentHandlers();
}

async function renderHomeLeaderboardSection() {
  try {
    const payload = await fetchLeaderboardPage({
      offset: 0,
      limit: HOME_LEADERBOARD_LIMIT,
      forceRefresh: false,
    });

    const players = Array.isArray(payload?.players) ? payload.players : [];
    if (!players.length) {
      return '';
    }

    const playerButtons = players
      .map((player) => {
        const playerName = escapeHtml(String(player?.playerNickname || 'Unknown Player'));
        const playerUuid = String(player?.playerUUID || playerName || 'steve').trim();
        const avatarUrl = proxiedImageUrl(
          `https://mc-heads.net/avatar/${encodeURIComponent(playerUuid)}/64`
        );
        const rank = Math.max(1, Number(player?.rank || 1));
        const sets = Math.max(0, Number(player?.setsUnlocked || 0));
        const rankClass =
          rank === 1
            ? ' recent-item__rank--top1'
            : rank === 2
              ? ' recent-item__rank--top2'
              : rank === 3
                ? ' recent-item__rank--top3'
                : '';
        return `<button class="recent-item recent-item--leaderboard" type="button" data-name="${playerName}" title="Open ${playerName}"><span class="recent-item__rank${rankClass}">#${rank}</span><span class="recent-item__identity"><img src="${avatarUrl}" alt="${playerName} avatar" width="36" height="36" loading="lazy" decoding="async"><span class="recent-item__name" data-rank="${rank}">${playerName}</span></span><span class="recent-item__meta"><span class="recent-item__sets">${sets} set${sets === 1 ? '' : 's'}</span><span class="recent-item__tiers">${renderHomeTierBadge(player?.vaultHuntersTier, 'vh')}${renderHomeTierBadge(player?.iskall85Tier, 'iskall')}</span></span></button>`;
      })
      .join('');

    return `
      <h3 class="recent-title recent-title--leaderboard">Top Unlock Leaderboard</h3>
      <div class="recent-grid">${playerButtons}</div>
      <div class="recent-grid recent-grid--leaderboard-link">
        <button class="recent-item" type="button" data-page="leaderboard">View Full Leaderboard</button>
      </div>
    `;
  } catch {
    return '';
  }
}

function shouldShowPagesSection() {
  return !usernameInput.value.trim() && resultContainer.classList.contains('hidden');
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
