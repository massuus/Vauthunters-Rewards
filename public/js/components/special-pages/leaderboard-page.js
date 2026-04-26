import { fetchLeaderboardPage } from '../../features/leaderboard.js';

const LEADERBOARD_QUERY_KEYWORDS = ['leaderboard', 'leader board', 'lb'];
const PAGE_SIZE = 10;
let activeObserver = null;
let activeScrollHandler = null;
let activeScrollState = null;
let activeSessionId = 0;

function normalizeQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function getLeaderboardQueryTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const match = raw.match(/^leaderboard\s*[:=]\s*(.+)$/i);
  if (!match) {
    return '';
  }

  return String(match[1] || '').trim();
}

function formatSetCount(count) {
  const safeCount = Math.max(0, Number(count || 0));
  return `${safeCount} ${safeCount === 1 ? 'set' : 'sets'}`;
}

function setStatus(statusEl, message, mode = 'muted') {
  if (!statusEl) {
    return;
  }

  statusEl.textContent = message;
  statusEl.classList.remove('leaderboard-page__status--error', 'leaderboard-page__status--muted');

  if (mode === 'error') {
    statusEl.classList.add('leaderboard-page__status--error');
  } else {
    statusEl.classList.add('leaderboard-page__status--muted');
  }
}

function disconnectActiveObserver() {
  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }

  if (activeScrollHandler) {
    window.removeEventListener('scroll', activeScrollHandler);
    window.removeEventListener('resize', activeScrollHandler);
    activeScrollHandler = null;
    activeScrollState = null;
  }
}

function scrollByDelta(deltaY) {
  window.scrollBy({ top: deltaY, behavior: 'instant' });
}

function renderTierBadge(label, modifier, escapeHtml) {
  const safeLabel = String(label || '').trim();

  if (!safeLabel) {
    return `<span class="leaderboard-tier leaderboard-tier--${modifier} leaderboard-tier--empty">None</span>`;
  }

  return `<span class="leaderboard-tier leaderboard-tier--${modifier}">${escapeHtml(safeLabel)}</span>`;
}

function renderLeaderboardRow(player, proxiedImageUrl, escapeHtml, focusPlayer = null) {
  const playerName = String(player?.playerNickname || '').trim();
  const safeName = escapeHtml(playerName || 'Unknown Player');
  const rank = Math.max(1, Number(player?.rank || 1));
  const rankClass =
    rank === 1
      ? ' leaderboard-row__rank--top1'
      : rank === 2
        ? ' leaderboard-row__rank--top2'
        : rank === 3
          ? ' leaderboard-row__rank--top3'
          : '';
  const avatarTarget = String(player?.playerUUID || playerName || 'steve').trim();
  const avatarUrl = proxiedImageUrl(
    `https://mc-heads.net/avatar/${encodeURIComponent(avatarTarget)}/64`
  );
  const setsLabel = formatSetCount(player?.setsUnlocked);
  const hasSearchTarget = Boolean(playerName);
  const isFocus = Boolean(
    focusPlayer &&
    (String(focusPlayer.playerUUID || '').toLowerCase() ===
      String(player?.playerUUID || '').toLowerCase() ||
      String(focusPlayer.playerNickname || '').toLowerCase() === playerName.toLowerCase())
  );
  const actionAttr = hasSearchTarget
    ? `data-player-name="${escapeHtml(playerName)}" title="Search ${safeName}"`
    : 'disabled aria-disabled="true"';

  return `
    <button class="leaderboard-row${isFocus ? ' leaderboard-row--focus' : ''}" type="button" ${actionAttr}>
      <span class="leaderboard-row__rank${rankClass}">#${rank}</span>
      <span class="leaderboard-row__identity">
        <img src="${avatarUrl}" alt="${safeName} avatar" width="40" height="40" loading="lazy" decoding="async">
        <span class="leaderboard-row__name">${safeName}</span>
      </span>
      <span class="leaderboard-row__sets">${setsLabel}</span>
      <span class="leaderboard-row__tiers">
        ${renderTierBadge(player?.vaultHuntersTier, 'vh', escapeHtml)}
        ${renderTierBadge(player?.iskall85Tier, 'iskall', escapeHtml)}
      </span>
    </button>
  `;
}

function renderLeaderboardRows(players, proxiedImageUrl, escapeHtml, focusPlayer = null) {
  return players
    .map((player) => renderLeaderboardRow(player, proxiedImageUrl, escapeHtml, focusPlayer))
    .join('');
}

function bindLeaderboardSearchHandlers(listEl, usernameInput, form) {
  listEl.addEventListener('click', (event) => {
    const rowButton = event.target.closest('[data-player-name]');
    if (!rowButton) {
      return;
    }

    const playerName = String(rowButton.getAttribute('data-player-name') || '').trim();
    if (!playerName) {
      return;
    }

    usernameInput.value = playerName;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

async function loadPage(state, direction, { throwOnError = false } = {}) {
  if (!state || state.loading || state.sessionId !== activeSessionId) {
    return;
  }

  state.loading = true;
  setStatus(
    state.statusEl,
    direction === 'up' ? 'Loading previous players...' : 'Loading more players...',
    'muted'
  );

  try {
    const isInitialLoad = state.firstOffset === null;
    const requestTarget = isInitialLoad && state.targetPlayer ? state.targetPlayer : '';
    const nextOffset =
      direction === 'up'
        ? Math.max(0, state.firstOffset - PAGE_SIZE)
        : isInitialLoad
          ? 0
          : state.lastOffsetExclusive;

    const payload = await fetchLeaderboardPage({
      offset: nextOffset,
      limit: PAGE_SIZE,
      forceRefresh: nextOffset === 0 || Boolean(requestTarget),
      targetPlayer: requestTarget,
    });

    if (state.sessionId !== activeSessionId) {
      return;
    }

    const players = Array.isArray(payload?.players) ? payload.players : [];
    state.total = Math.max(Number(payload?.total || 0), state.total, nextOffset + players.length);

    if (!players.length) {
      if (direction === 'up') {
        state.canLoadUp = false;
      } else {
        state.canLoadDown = false;
      }

      if (!state.canLoadUp && !state.canLoadDown) {
        state.done = true;
        state.loadMoreButtonEl.setAttribute('hidden', '');
        state.loadPrevButtonEl.setAttribute('hidden', '');
        disconnectActiveObserver();
      }

      if (state.listEl.childElementCount === 0) {
        state.listEl.innerHTML = `
          <p class="leaderboard-page__empty">
            No tracked players yet. Search for a player with at least one unlocked set to start the leaderboard.
          </p>
        `;
        setStatus(state.statusEl, 'No leaderboard entries yet.', 'muted');
      } else if (direction === 'up') {
        setStatus(state.statusEl, 'Reached the top of the leaderboard.', 'muted');
      } else {
        setStatus(state.statusEl, 'Reached the bottom of the leaderboard.', 'muted');
      }

      return;
    }

    state.focusPlayer = payload.focusPlayer || state.focusPlayer;

    const rowsHtml = renderLeaderboardRows(
      players,
      state.proxiedImageUrl,
      state.escapeHtml,
      state.focusPlayer
    );

    const previousScrollHeight = document.documentElement.scrollHeight;

    if (direction === 'up') {
      state.listEl.insertAdjacentHTML('afterbegin', rowsHtml);
      state.firstOffset = Number(payload?.offset ?? nextOffset);
      const nextScrollHeight = document.documentElement.scrollHeight;
      scrollByDelta(nextScrollHeight - previousScrollHeight);
    } else {
      state.listEl.insertAdjacentHTML('beforeend', rowsHtml);
      if (isInitialLoad) {
        state.firstOffset = Number(payload?.offset ?? nextOffset);
      }
      state.lastOffsetExclusive = Number(payload?.offset ?? nextOffset) + players.length;
    }

    state.highestRank = Math.max(
      state.highestRank,
      ...players.map((player) => Number(player?.rank || 0))
    );

    state.canLoadUp = state.firstOffset > 0;
    state.canLoadDown = Boolean(payload?.hasMore) && state.lastOffsetExclusive < state.total;

    state.done = !state.canLoadUp && !state.canLoadDown;

    if (!state.canLoadUp) {
      state.loadPrevButtonEl.setAttribute('hidden', '');
    } else {
      state.loadPrevButtonEl.removeAttribute('hidden');
    }

    if (!state.canLoadDown) {
      state.loadMoreButtonEl.setAttribute('hidden', '');
    } else {
      state.loadMoreButtonEl.removeAttribute('hidden');
    }

    if (!state.canLoadDown && !state.canLoadUp) {
      disconnectActiveObserver();
    }

    const shownCount = state.listEl.querySelectorAll('.leaderboard-row').length;
    setStatus(state.statusEl, `Showing ${shownCount} of ${state.total} players...`, 'muted');
  } catch (error) {
    state.done = true;
    state.loadMoreButtonEl.setAttribute('hidden', '');
    state.loadPrevButtonEl.setAttribute('hidden', '');
    disconnectActiveObserver();

    const message = error instanceof Error ? error.message : 'Unable to load leaderboard.';
    setStatus(state.statusEl, message, 'error');

    if (throwOnError) {
      throw error;
    }
  } finally {
    state.loading = false;
  }
}

function setupInfiniteScroll(state) {
  if (!state || state.done) {
    return;
  }

  disconnectActiveObserver();

  activeScrollState = state;
  const onScroll = () => {
    const currentState = activeScrollState;
    if (
      !currentState ||
      currentState.sessionId !== activeSessionId ||
      currentState.loading ||
      currentState.done
    ) {
      return;
    }

    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const viewportBottom = scrollTop + window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const nearBottom = documentHeight - viewportBottom < 240;
    const nearTop = scrollTop < 180;

    if (nearBottom && currentState.canLoadDown) {
      loadPage(currentState, 'down').catch(() => {});
      return;
    }

    if (nearTop && currentState.canLoadUp) {
      loadPage(currentState, 'up').catch(() => {});
    }
  };

  activeScrollHandler = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  onScroll();
}

export function teardownLeaderboardPage() {
  activeSessionId += 1;
  disconnectActiveObserver();
}

export function isLeaderboardQuery(value) {
  const normalized = normalizeQuery(value);
  return (
    LEADERBOARD_QUERY_KEYWORDS.includes(normalized) || Boolean(getLeaderboardQueryTarget(value))
  );
}

export async function renderLeaderboardPage(
  resultContainer,
  setFavicon,
  setMetaDescription,
  closeSetDetailModal,
  updateQueryString,
  proxiedImageUrl,
  escapeHtml,
  DEFAULT_FAVICON,
  usernameInput,
  form,
  targetPlayer = ''
) {
  teardownLeaderboardPage();
  activeSessionId += 1;

  const sessionId = activeSessionId;

  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `
    <section class="leaderboard-page">
      <div class="leaderboard-page__loading">Loading leaderboard...</div>
    </section>
  `;

  setFavicon(DEFAULT_FAVICON);
  document.title = 'Vault Hunters Unlock Leaderboard';
  setMetaDescription(
    'See which players have unlocked the most Vault Hunters reward sets and compare Patreon tiers.'
  );
  closeSetDetailModal();

  try {
    resultContainer.innerHTML = `
      <section class="leaderboard-page" aria-live="polite">
        <header class="leaderboard-page__intro">
          <h2 class="leaderboard-page__title">Unlock Leaderboard</h2>
        </header>
        <div class="leaderboard-list" data-leaderboard-list></div>
        <div class="leaderboard-page__controls">
          <button class="leaderboard-page__load-more leaderboard-page__load-more--prev" type="button" data-leaderboard-load-prev hidden>
            Load 10 previous
          </button>
          <p class="leaderboard-page__status leaderboard-page__status--muted" data-leaderboard-status>
            Loading leaderboard...
          </p>
          <button class="leaderboard-page__load-more leaderboard-page__load-more--next" type="button" data-leaderboard-load-more hidden>
            Load 10 more
          </button>
        </div>
      </section>
    `;

    const listEl = resultContainer.querySelector('[data-leaderboard-list]');
    const statusEl = resultContainer.querySelector('[data-leaderboard-status]');
    const loadPrevButtonEl = resultContainer.querySelector('[data-leaderboard-load-prev]');
    const loadMoreButtonEl = resultContainer.querySelector('[data-leaderboard-load-more]');

    if (!listEl || !statusEl || !loadMoreButtonEl || !loadPrevButtonEl) {
      throw new Error('Unable to initialize leaderboard layout.');
    }

    const state = {
      sessionId,
      listEl,
      statusEl,
      loadPrevButtonEl,
      loadMoreButtonEl,
      proxiedImageUrl,
      escapeHtml,
      firstOffset: null,
      lastOffsetExclusive: 0,
      total: 0,
      highestRank: 0,
      focusPlayer: null,
      loading: false,
      done: false,
      canLoadUp: true,
      canLoadDown: true,
      targetPlayer: String(targetPlayer || '').trim(),
    };

    bindLeaderboardSearchHandlers(listEl, usernameInput, form);

    loadPrevButtonEl.addEventListener('click', () => {
      loadPage(state, 'up').catch(() => {});
    });

    loadMoreButtonEl.addEventListener('click', () => {
      loadPage(state, 'down').catch(() => {});
    });

    await loadPage(state, 'down', { throwOnError: true });

    if (sessionId !== activeSessionId) {
      return;
    }

    if (!state.done) {
      setupInfiniteScroll(state);
    }

    updateQueryString(
      state.targetPlayer
        ? `leaderboard=${encodeURIComponent(state.targetPlayer)}`
        : LEADERBOARD_QUERY_KEYWORDS[0]
    );
  } catch (error) {
    resultContainer.innerHTML = `
      <section class="leaderboard-page">
        <p class="leaderboard-page__error">We couldn't load the leaderboard right now. Please refresh and try again.</p>
      </section>
    `;
    updateQueryString('');
    throw error;
  }
}
