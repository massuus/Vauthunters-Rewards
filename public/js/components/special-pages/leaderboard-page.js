import { apiRequest, normalizeStreamer } from '../../features/companion-admin.js';
import { clearLeaderboardCache, fetchLeaderboardPage } from '../../features/leaderboard.js';

const LEADERBOARD_QUERY_KEYWORDS = ['leaderboard', 'leader board', 'lb'];
const PAGE_SIZE = 10;
const METRICS = {
  setsUnlocked: {
    label: 'Unlocked sets',
    title: 'Unlock Leaderboard',
    description: 'Players with the most unlocked Vault Hunters reward sets.',
  },
  seasonLevel: {
    label: 'Season level',
    title: 'Season Level Leaderboard',
    description: 'Companions ranked by their current season level.',
  },
  vaultsJoined: {
    label: 'Vaults joined',
    title: 'Vaults Joined Leaderboard',
    description: 'Companions ranked by how many community vaults they joined.',
  },
  combinedLevel: {
    label: 'Combined levels',
    title: 'Combined Companion Levels',
    description: 'Players ranked by the sum of their companion levels across all streamers.',
  },
};

let activeSessionId = 0;
let activeObserver = null;
let disposeAdminPanel;

function normalizeQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeMetric(value) {
  return Object.hasOwn(METRICS, value) ? value : 'setsUnlocked';
}

function getInitialOptions() {
  const params = new URLSearchParams(window.location.search);
  return {
    metric: normalizeMetric(params.get('metric')),
    streamer: normalizeStreamer(params.get('streamer')),
  };
}

export function getLeaderboardQueryTarget(value) {
  const match = String(value || '')
    .trim()
    .match(/^leaderboard\s*[:=]\s*(.+)$/i);
  return match ? String(match[1] || '').trim() : '';
}

export function isLeaderboardQuery(value) {
  const normalized = normalizeQuery(value);
  return (
    LEADERBOARD_QUERY_KEYWORDS.includes(normalized) || Boolean(getLeaderboardQueryTarget(value))
  );
}

function disconnectObserver() {
  activeObserver?.disconnect();
  activeObserver = null;
}

export function teardownLeaderboardPage() {
  disposeAdminPanel?.();
  disposeAdminPanel = null;
  activeSessionId += 1;
  disconnectObserver();
}

function setStatus(statusEl, message, mode = 'muted') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('leaderboard-page__status--error', mode === 'error');
  statusEl.classList.toggle('leaderboard-page__status--muted', mode !== 'error');
}

function rankClass(rank) {
  if (rank === 1) return ' leaderboard-row__rank--top1';
  if (rank === 2) return ' leaderboard-row__rank--top2';
  if (rank === 3) return ' leaderboard-row__rank--top3';
  return '';
}

function renderTierBadge(label, modifier, escapeHtml) {
  const safeLabel = String(label || '').trim();
  if (!safeLabel) {
    return `<span class="leaderboard-tier leaderboard-tier--${modifier} leaderboard-tier--empty">None</span>`;
  }
  return `<span class="leaderboard-tier leaderboard-tier--${modifier}">${escapeHtml(safeLabel)}</span>`;
}

function plural(value, singular, pluralLabel = `${singular}s`) {
  const number = Math.max(0, Number(value || 0));
  return `${number} ${number === 1 ? singular : pluralLabel}`;
}

export function isLeaderboardPlayerFocused(player, focusPlayer) {
  if (!focusPlayer) return false;

  const focusTwitchName = String(focusPlayer.twitchName || '').toLowerCase();
  const playerTwitchName = String(player?.twitchName || '').toLowerCase();
  if (focusTwitchName) return Boolean(playerTwitchName && focusTwitchName === playerTwitchName);

  const focusUUID = String(focusPlayer.playerUUID || focusPlayer.minecraftUUID || '').toLowerCase();
  const playerUUID = String(player?.playerUUID || player?.minecraftUUID || '').toLowerCase();
  if (focusUUID) return Boolean(playerUUID && focusUUID === playerUUID);

  const focusName = String(focusPlayer.playerNickname || '').toLowerCase();
  const playerName = String(player?.playerNickname || '').toLowerCase();
  return Boolean(focusName && focusName === playerName);
}

function renderRow(player, state) {
  const playerName = String(player?.playerNickname || '').trim();
  const safeName = state.escapeHtml(playerName || 'Unknown Player');
  const rank = Math.max(1, Number(player?.rank || 1));
  const avatarTarget = String(
    player?.minecraftUUID || player?.playerUUID || player?.skinName || playerName || 'steve'
  ).trim();
  const avatarUrl = state.proxiedImageUrl(
    `https://mc-heads.net/avatar/${encodeURIComponent(avatarTarget)}/64`
  );
  const isFocus = isLeaderboardPlayerFocused(player, state.focusPlayer);
  const searchIdentity = player?.twitchName ? `twitch:${player.twitchName}` : playerName;
  const actionAttr = searchIdentity
    ? `data-player-name="${state.escapeHtml(searchIdentity)}" title="Open ${safeName}'s rewards"`
    : 'disabled aria-disabled="true"';
  const companionIdentity = player?.twitchName
    ? `<span class="leaderboard-row__identity-details">
         <small class="leaderboard-row__handle">Twitch: @${state.escapeHtml(player.twitchName)}</small>
         ${
           player.minecraftName
             ? `<small class="leaderboard-row__minecraft">Minecraft: ${state.escapeHtml(player.minecraftName)}</small>`
             : ''
         }
       </span>`
    : '';
  const stats =
    state.metric === 'setsUnlocked'
      ? `<span class="leaderboard-row__sets">${plural(player?.setsUnlocked, 'set')}</span>
         <span class="leaderboard-row__tiers">
           ${renderTierBadge(player?.vaultHuntersTier, 'vh', state.escapeHtml)}
           ${renderTierBadge(player?.iskall85Tier, 'iskall', state.escapeHtml)}
         </span>`
      : `<span class="leaderboard-row__stat${state.metric === 'seasonLevel' ? ' is-active' : ''}">
           <small>Level</small><strong>${Math.max(0, Number(player?.seasonLevel || 0))}</strong>
         </span>
         <span class="leaderboard-row__stat${state.metric === 'vaultsJoined' ? ' is-active' : ''}">
           <small>Vaults</small><strong>${Math.max(0, Number(player?.vaultsJoined || 0))}</strong>
         </span>`;

  return `
    <button class="leaderboard-row${isFocus ? ' leaderboard-row--focus' : ''}${
      state.metric === 'setsUnlocked' ? '' : ' leaderboard-row--companion'
    }" type="button" ${actionAttr}>
      <span class="leaderboard-row__rank${rankClass(rank)}">#${rank}</span>
      <span class="leaderboard-row__identity">
        <img src="${avatarUrl}" alt="${safeName} avatar" width="40" height="40" loading="lazy" decoding="async">
        <span class="leaderboard-row__identity-copy">
          <span class="leaderboard-row__name" data-rank="${rank}">${safeName}</span>
          ${companionIdentity}
        </span>
      </span>
      <span class="leaderboard-row__meta">${stats}</span>
    </button>`;
}

function updateUrl(state) {
  const params = new URLSearchParams();
  if (!state.adminMode) params.set('leaderboard', state.targetPlayer || '');
  if (state.metric !== 'setsUnlocked') {
    params.set('metric', state.metric);
    params.set('streamer', state.streamer);
  }
  state.updateQueryString(
    state.adminMode ? params.toString() : params.toString().replace(/^leaderboard=$/, 'leaderboard')
  );
}

function updateHeading(state) {
  const config = METRICS[state.metric];
  state.root.querySelector('[data-leaderboard-title]').textContent = state.adminMode
    ? 'Admin dashboard'
    : config.title;
  state.root.querySelector('[data-leaderboard-description]').textContent = state.adminMode
    ? 'Monitor automation, manage companion data, and review the current leaderboard.'
    : ['setsUnlocked', 'combinedLevel'].includes(state.metric)
      ? config.description
      : `${config.description} Showing ${state.streamer}'s community.`;
  state.root.querySelectorAll('[data-leaderboard-metric]').forEach((button) => {
    const selected = button.dataset.leaderboardMetric === state.metric;
    button.setAttribute('aria-selected', String(selected));
    button.classList.toggle('is-active', selected);
  });
  state.root.querySelector('[data-leaderboard-streamer-wrap]').hidden = [
    'setsUnlocked',
    'combinedLevel',
  ].includes(state.metric);
}

function updateSnapshotTime(state, value) {
  const element = state.snapshotTimeEl;
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    element.hidden = true;
    element.replaceChildren();
    return;
  }

  const time = document.createElement('time');
  time.dateTime = date.toISOString();
  time.title = date.toISOString();
  time.textContent = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  element.replaceChildren('Leaderboard last updated: ', time);
  element.hidden = false;
}

function getLeaderboardUpdatedAt(state, payload) {
  if (['setsUnlocked', 'combinedLevel'].includes(state.metric)) return payload.snapshotGeneratedAt;
  return (
    state.streamers.find(
      (streamer) => String(streamer?.login || '').toLowerCase() === state.streamer
    )?.updatedAt || null
  );
}

function updateStreamerMenus(state) {
  const streamers = new Map((state.streamers || []).map((streamer) => [streamer.login, streamer]));
  if (!streamers.has(state.streamer)) {
    streamers.set(state.streamer, { login: state.streamer, playerCount: 0 });
  }
  const options = [...streamers.values()]
    .sort((left, right) => left.login.localeCompare(right.login))
    .map(
      (streamer) =>
        `<option value="${state.escapeHtml(streamer.login)}"${
          streamer.login === state.streamer ? ' selected' : ''
        }>${state.escapeHtml(streamer.login)}${
          streamer.playerCount ? ` (${streamer.playerCount.toLocaleString()} players)` : ''
        }</option>`
    )
    .join('');

  state.root
    .querySelectorAll('[data-leaderboard-streamer-select], [data-companion-streamer-select]')
    .forEach((select) => {
      select.innerHTML = options;
      select.value = state.streamer;
    });
}

function resetList(state) {
  disconnectObserver();
  state.loadGeneration += 1;
  state.listEl.innerHTML = '';
  updateSnapshotTime(state, null);
  state.firstOffset = null;
  state.lastOffsetExclusive = 0;
  state.total = 0;
  state.focusPlayer = null;
  state.canLoadUp = false;
  state.canLoadDown = true;
  state.loading = false;
  state.loadPrevButtonEl.hidden = true;
  state.loadMoreButtonEl.hidden = true;
}

async function loadPage(state, direction, { throwOnError = false } = {}) {
  if (state.loading || state.sessionId !== activeSessionId) return;
  const loadGeneration = state.loadGeneration;
  state.loading = true;
  setStatus(state.statusEl, direction === 'up' ? 'Loading previous players…' : 'Loading players…');

  try {
    const initial = state.firstOffset === null;
    const offset =
      direction === 'up'
        ? Math.max(0, state.firstOffset - PAGE_SIZE)
        : initial
          ? 0
          : state.lastOffsetExclusive;
    const payload = await fetchLeaderboardPage({
      offset,
      limit: PAGE_SIZE,
      forceRefresh: false,
      targetPlayer: initial ? state.targetPlayer : '',
      metric: state.metric,
      streamer: state.streamer,
    });
    if (state.sessionId !== activeSessionId || loadGeneration !== state.loadGeneration) return;

    const players = Array.isArray(payload.players) ? payload.players : [];
    state.total = Number(payload.total || 0);
    state.focusPlayer = payload.focusPlayer || state.focusPlayer;
    if (Array.isArray(payload.streamers) && payload.streamers.length) {
      state.streamers = payload.streamers;
      updateStreamerMenus(state);
    }
    updateSnapshotTime(state, getLeaderboardUpdatedAt(state, payload));

    if (!players.length) {
      if (!state.listEl.childElementCount) {
        state.listEl.innerHTML =
          '<p class="leaderboard-page__empty">No players have been imported for this leaderboard yet.</p>';
      }
      state.canLoadDown = false;
      state.canLoadUp = false;
    } else {
      const html = players.map((player) => renderRow(player, state)).join('');
      if (direction === 'up') {
        const previousHeight = document.documentElement.scrollHeight;
        state.listEl.insertAdjacentHTML('afterbegin', html);
        state.firstOffset = Number(payload.offset ?? offset);
        window.scrollBy({
          top: document.documentElement.scrollHeight - previousHeight,
          behavior: 'instant',
        });
      } else {
        state.listEl.insertAdjacentHTML('beforeend', html);
        if (initial) state.firstOffset = Number(payload.offset ?? offset);
        state.lastOffsetExclusive = Number(payload.offset ?? offset) + players.length;
      }
      state.canLoadUp = state.firstOffset > 0;
      state.canLoadDown = Boolean(payload.hasMore) && state.lastOffsetExclusive < state.total;
    }

    state.loadPrevButtonEl.hidden = !state.canLoadUp;
    state.loadMoreButtonEl.hidden = !state.canLoadDown;
    const shown = state.listEl.querySelectorAll('.leaderboard-row').length;
    setStatus(state.statusEl, `Showing ${shown} of ${state.total} players.`);
  } catch (error) {
    if (loadGeneration !== state.loadGeneration) return;
    state.canLoadDown = false;
    setStatus(
      state.statusEl,
      error instanceof Error ? error.message : 'Unable to load leaderboard.',
      'error'
    );
    if (throwOnError) throw error;
  } finally {
    if (loadGeneration === state.loadGeneration) {
      state.loading = false;
      setupInfiniteScroll(state);
    }
  }
}

function setupInfiniteScroll(state) {
  if (state.sessionId !== activeSessionId) return;
  disconnectObserver();
  if (!state.canLoadDown || !('IntersectionObserver' in window)) return;
  activeObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadPage(state, 'down').catch(() => {});
    },
    { rootMargin: '240px' }
  );
  activeObserver.observe(state.sentinelEl);
}

async function selectMetric(state, metric) {
  state.metric = normalizeMetric(metric);
  resetList(state);
  updateHeading(state);
  updateUrl(state);
  await loadPage(state, 'down');
}

async function refreshCurrentCompanionBoard(state, streamer) {
  clearLeaderboardCache();
  state.streamer = normalizeStreamer(streamer);
  if (state.metric === 'setsUnlocked') state.metric = 'seasonLevel';
  resetList(state);
  updateHeading(state);
  updateUrl(state);
  updateStreamerMenus(state);
  await loadPage(state, 'down');
}

function bindPage(state) {
  state.root.addEventListener('click', (event) => {
    const metricButton = event.target.closest('[data-leaderboard-metric]');
    if (metricButton) {
      selectMetric(state, metricButton.dataset.leaderboardMetric).catch(() => {});
      return;
    }
    const playerButton = event.target.closest('[data-player-name]');
    if (playerButton) {
      state.usernameInput.value = playerButton.dataset.playerName || '';
      state.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return;
    }
    if (event.target.closest('[data-leaderboard-load-prev]')) loadPage(state, 'up').catch(() => {});
    if (event.target.closest('[data-leaderboard-load-more]'))
      loadPage(state, 'down').catch(() => {});
  });

  state.root.addEventListener('change', (event) => {
    const streamerSelect = event.target.closest('[data-leaderboard-streamer-select]');
    if (!streamerSelect) return;

    const streamer = normalizeStreamer(streamerSelect.value, '');
    if (!streamer || streamer === state.streamer) return;

    streamerSelect.disabled = true;
    refreshCurrentCompanionBoard(state, streamer)
      .catch((error) => {
        setStatus(
          state.statusEl,
          error instanceof Error ? error.message : 'Unable to change streamer.',
          'error'
        );
      })
      .finally(() => {
        streamerSelect.disabled = false;
      });
  });
}

export async function renderLeaderboardPage(
  resultContainer,
  setFavicon,
  setMetaDescription,
  updateQueryString,
  proxiedImageUrl,
  escapeHtml,
  DEFAULT_FAVICON,
  usernameInput,
  form,
  targetPlayer = '',
  adminMode = false
) {
  teardownLeaderboardPage();
  activeSessionId += 1;
  const sessionId = activeSessionId;
  const initial = getInitialOptions();

  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `
    <section class="leaderboard-page" aria-live="polite">
      <header class="leaderboard-page__intro">
        <div class="special-page-heading-row">
          <h2 class="leaderboard-page__title" data-leaderboard-title>${adminMode ? 'Admin dashboard' : 'Leaderboard'}</h2>
          ${adminMode ? '' : '<a class="home-button special-page-heading-row__action" href="?stats">Companion stats</a>'}
        </div>
        <p class="leaderboard-page__lead" data-leaderboard-description>${adminMode ? 'Monitor automation and manage companion leaderboard data.' : ''}</p>
        <p class="leaderboard-page__updated" data-leaderboard-updated hidden></p>
      </header>
      <div class="leaderboard-page__tabs" role="tablist" aria-label="Leaderboard type" data-admin-content${adminMode ? ' hidden' : ''}>
        ${Object.entries(METRICS)
          .map(
            ([metric, config]) =>
              `<button type="button" role="tab" data-leaderboard-metric="${metric}">${config.label}</button>`
          )
          .join('')}
      </div>
      <div class="leaderboard-page__streamer" data-leaderboard-streamer-wrap hidden>
        <label><span>Streamer</span><select name="streamer" data-leaderboard-streamer-select required><option value="${escapeHtml(initial.streamer)}">${escapeHtml(initial.streamer)}</option></select></label>
      </div>
      ${adminMode ? '<div data-leaderboard-admin-slot></div>' : ''}
      <div class="leaderboard-list" data-leaderboard-list data-admin-content${adminMode ? ' hidden' : ''}></div>
      <div class="leaderboard-page__sentinel" data-leaderboard-sentinel data-admin-content${adminMode ? ' hidden' : ''} aria-hidden="true"></div>
      <div class="leaderboard-page__controls" data-admin-content${adminMode ? ' hidden' : ''}>
        <button class="leaderboard-page__load-more leaderboard-page__load-more--prev" type="button" data-leaderboard-load-prev hidden>Load 10 previous</button>
        <p class="leaderboard-page__status leaderboard-page__status--muted" data-leaderboard-status>Loading leaderboard…</p>
        <button class="leaderboard-page__load-more leaderboard-page__load-more--next" type="button" data-leaderboard-load-more hidden>Load 10 more</button>
      </div>
    </section>`;

  setFavicon(DEFAULT_FAVICON);
  document.title = adminMode ? 'VH Rewards Admin' : 'Vault Hunters Leaderboards';
  setMetaDescription(
    adminMode
      ? 'Administrator dashboard for Vault Hunters Rewards automation.'
      : 'Compare Vault Hunters unlocked sets, companion season levels, and vaults joined.'
  );

  const root = resultContainer.querySelector('.leaderboard-page');
  const state = {
    sessionId,
    root,
    listEl: root.querySelector('[data-leaderboard-list]'),
    snapshotTimeEl: root.querySelector('[data-leaderboard-updated]'),
    statusEl: root.querySelector('[data-leaderboard-status]'),
    loadPrevButtonEl: root.querySelector('[data-leaderboard-load-prev]'),
    loadMoreButtonEl: root.querySelector('[data-leaderboard-load-more]'),
    sentinelEl: root.querySelector('[data-leaderboard-sentinel]'),
    metric: initial.metric,
    streamer: initial.streamer,
    streamers: [{ login: initial.streamer, playerCount: 0 }],
    targetPlayer: String(targetPlayer || '').trim(),
    firstOffset: null,
    lastOffsetExclusive: 0,
    total: 0,
    focusPlayer: null,
    canLoadUp: false,
    canLoadDown: true,
    loading: false,
    loadGeneration: 0,
    auth: null,
    adminMode,
    proxiedImageUrl,
    escapeHtml,
    updateQueryString,
    usernameInput,
    form,
  };

  bindPage(state);
  updateHeading(state);
  updateUrl(state);

  try {
    if (adminMode) {
      try {
        state.auth = await apiRequest('/api/auth/me');
      } catch {
        state.auth = null;
      }
      if (sessionId !== activeSessionId) return;
      const { mountLeaderboardAdmin } = await import('../leaderboard-admin.js');
      if (sessionId !== activeSessionId) return;
      disposeAdminPanel = mountLeaderboardAdmin({
        root: state.root,
        auth: state.auth,
        escapeHtml: state.escapeHtml,
        isActive: () => sessionId === activeSessionId,
        updateStreamerMenus: () => updateStreamerMenus(state),
        onSaved: (streamer) => {
          if (sessionId === activeSessionId) return refreshCurrentCompanionBoard(state, streamer);
        },
      });
      if (!state.auth?.authenticated || !state.auth.user?.isAdmin) return;
      state.root.querySelectorAll('[data-admin-content]').forEach((element) => {
        element.hidden = false;
      });
    }
    await loadPage(state, 'down', { throwOnError: true });
  } catch (error) {
    if (!state.listEl.childElementCount) {
      state.listEl.innerHTML =
        '<p class="leaderboard-page__error">We could not load this leaderboard. Please try again.</p>';
    }
    throw error;
  }
}

export function isAdminQuery(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'admin'
  );
}

export function renderAdminPage(...args) {
  return renderLeaderboardPage(...args, '', true);
}
