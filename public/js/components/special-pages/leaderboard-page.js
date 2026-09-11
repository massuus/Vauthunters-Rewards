import { clearLeaderboardCache, fetchLeaderboardPage } from '../../features/leaderboard.js';

const LEADERBOARD_QUERY_KEYWORDS = ['leaderboard', 'leader board', 'lb'];
const PAGE_SIZE = 10;
const IMPORT_BATCH_SIZE = 100;
const IDENTITY_BATCH_SIZE = 5;
const SOCKET_PAGE_SIZE = 20;
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
};

let activeSessionId = 0;
let activeObserver = null;

function normalizeQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeStreamer(value, fallback = 'iskall85') {
  const streamer = String(value || fallback)
    .trim()
    .toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(streamer) ? streamer : fallback;
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
  params.set('leaderboard', state.targetPlayer || '');
  if (state.metric !== 'setsUnlocked') {
    params.set('metric', state.metric);
    params.set('streamer', state.streamer);
  }
  state.updateQueryString(params.toString().replace(/^leaderboard=$/, 'leaderboard'));
}

function updateHeading(state) {
  const config = METRICS[state.metric];
  state.root.querySelector('[data-leaderboard-title]').textContent = config.title;
  state.root.querySelector('[data-leaderboard-description]').textContent =
    state.metric === 'setsUnlocked'
      ? config.description
      : `${config.description} Showing ${state.streamer}'s community.`;
  state.root.querySelectorAll('[data-leaderboard-metric]').forEach((button) => {
    const selected = button.dataset.leaderboardMetric === state.metric;
    button.setAttribute('aria-selected', String(selected));
    button.classList.toggle('is-active', selected);
  });
  state.root.querySelector('[data-leaderboard-streamer-wrap]').hidden =
    state.metric === 'setsUnlocked';
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

async function apiRequest(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  let body = {};
  try {
    body = await response.json();
  } catch {}
  if (!response.ok) throw new Error(body.error || 'The request failed.');
  return body;
}

function setAdminFeedback(state, message, type = 'success') {
  const element = state.root.querySelector('[data-companion-admin-feedback]');
  if (!element) return;
  element.hidden = false;
  element.textContent = message;
  element.classList.toggle('leaderboard-admin__feedback--error', type === 'error');
}

function renderAdminPanel(state) {
  const slot = state.root.querySelector('[data-leaderboard-admin-slot]');
  if (!slot) return;
  if (!state.auth?.authenticated) {
    slot.replaceChildren();
    return;
  }
  if (!state.auth.user?.isAdmin) return;

  slot.innerHTML = `
    <details class="leaderboard-admin">
      <summary>Update companion leaderboards</summary>
      <div class="leaderboard-admin__body">
        <p class="leaderboard-admin__privacy"><strong>Private by design:</strong> the WSS URL is opened by this browser only. Its tokens are never uploaded or saved.</p>
        <form class="leaderboard-admin__form" data-companion-wss-form>
          <label class="leaderboard-admin__field leaderboard-admin__field--wide">
            <span>Socket.IO WSS URL</span>
            <textarea name="wssUrl" rows="3" placeholder="wss://ebs.vaulthunters.gg/socket.io/?streamer=iskall85&amp;…" required></textarea>
          </label>
          <button class="leaderboard-admin__button" type="submit">Retrieve and update</button>
        </form>
        <div class="leaderboard-admin__divider"><span>or add one player</span></div>
        <form class="leaderboard-admin__form leaderboard-admin__form--manual" data-companion-manual-form>
          <label class="leaderboard-admin__field"><span>Streamer</span><select name="streamer" data-companion-streamer-select required></select></label>
          <label class="leaderboard-admin__field"><span>Twitch username <small>(optional)</small></span><input name="twitchName" pattern="[A-Za-z0-9_]{1,25}" placeholder="massuus"></label>
          <label class="leaderboard-admin__field"><span>Selected skin username</span><input name="playerName" pattern="[A-Za-z0-9_]{1,16}" required placeholder="Skin username"></label>
          <label class="leaderboard-admin__field"><span>Display alias <small>(optional)</small></span><input name="alias" maxlength="64"></label>
          <label class="leaderboard-admin__field"><span>Season level</span><input name="seasonLevel" type="number" min="0" max="1000000" value="0" required></label>
          <label class="leaderboard-admin__field"><span>Vaults joined</span><input name="vaultsJoined" type="number" min="0" max="1000000" value="0" required></label>
          <button class="leaderboard-admin__button" type="submit">Add or update player</button>
        </form>
        <p class="leaderboard-admin__feedback" data-companion-admin-feedback hidden></p>
      </div>
    </details>`;
  updateStreamerMenus(state);
}

function cleanWssUrl(value) {
  return String(value || '')
    .trim()
    .replace(/^wss\\:\/\//i, 'wss://')
    .replace(/\\_/g, '_')
    .replace(/&amp;/gi, '&')
    .replace(/&#x26;/gi, '&');
}

function readStreamerFromWss(value) {
  let url;
  try {
    url = new URL(cleanWssUrl(value));
  } catch {
    throw new Error('Enter a valid WSS URL.');
  }
  if (url.protocol !== 'wss:' || url.hostname !== 'ebs.vaulthunters.gg') {
    throw new Error('The URL must use wss://ebs.vaulthunters.gg.');
  }
  const streamer = normalizeStreamer(url.searchParams.get('streamer'), '');
  if (!streamer) throw new Error('The WSS URL does not contain a valid streamer.');
  return { url: url.toString(), streamer };
}

function retrieveCompanions(wssValue, onProgress) {
  const { url, streamer } = readStreamerFromWss(wssValue);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const players = [];
    let page = 1;
    let totalPages = null;
    let ackId = 1;
    let finished = false;
    let idleTimer;

    const fail = (message) => {
      if (finished) return;
      finished = true;
      clearTimeout(idleTimer);
      try {
        socket.close();
      } catch {}
      reject(new Error(message));
    };
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => fail('The companion socket stopped responding.'), 20_000);
    };
    const requestPage = () => {
      resetIdleTimer();
      onProgress(`Retrieving page ${page}${totalPages ? ` of ${totalPages}` : ''}…`);
      socket.send(
        `42/extension,${ackId}["requestDraftCompanionSearch","",${page},${SOCKET_PAGE_SIZE}]`
      );
    };

    socket.addEventListener('open', resetIdleTimer);
    socket.addEventListener('error', () =>
      fail('The WSS connection failed. Check that its tokens are current.')
    );
    socket.addEventListener('close', () => {
      if (!finished) fail('The WSS connection closed before every page was received.');
    });
    socket.addEventListener('message', (event) => {
      const message = String(event.data || '');
      resetIdleTimer();
      if (message.startsWith('0')) {
        socket.send('40/extension,');
        return;
      }
      if (message.startsWith('2')) {
        socket.send(`3${message.slice(1)}`);
        return;
      }
      if (message.startsWith('40/extension')) {
        requestPage();
        return;
      }

      const match = message.match(/^43\/extension,\d+(\[.*\])$/s);
      if (!match) return;
      let acknowledgement;
      try {
        acknowledgement = JSON.parse(match[1]);
      } catch {
        fail('The companion socket returned unreadable data.');
        return;
      }

      const payload = acknowledgement?.[0] || {};
      const pagePlayers = Array.isArray(payload.data) ? payload.data : [];
      players.push(...pagePlayers);
      totalPages = Math.max(1, Number(payload.pagination?.totalPages || page));
      if (page >= totalPages) {
        const uniquePlayers = [
          ...new Map(
            players
              .filter((player) => player?.name && player?.skin)
              .map((player) => [String(player.name).toLowerCase(), player])
          ).values(),
        ];
        if (!uniquePlayers.length) {
          fail(
            'The socket returned no companion players. Paste the WSS URL directly and make sure its tokens are still current.'
          );
          return;
        }
        finished = true;
        clearTimeout(idleTimer);
        socket.close(1000, 'complete');
        resolve({ streamer, players: uniquePlayers, received: players.length });
        return;
      }
      page += 1;
      ackId += 1;
      requestPage();
    });
  });
}

async function uploadPlayers(state, streamer, players, onProgress) {
  if (!players.length) throw new Error('The socket returned no companion players to update.');
  let updated = 0;
  let skipped = 0;
  const batches = Math.ceil(players.length / IMPORT_BATCH_SIZE);
  for (let index = 0; index < players.length; index += IMPORT_BATCH_SIZE) {
    const batchNumber = Math.floor(index / IMPORT_BATCH_SIZE) + 1;
    onProgress(`Saving batch ${batchNumber} of ${batches}…`);
    const result = await apiRequest('/api/admin/companion-leaderboard', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': state.auth.user.csrfToken,
      },
      body: JSON.stringify({
        streamer,
        players: players.slice(index, index + IMPORT_BATCH_SIZE),
        source: 'wss-browser-import',
      }),
    });
    updated += Number(result.updated || 0);
    skipped += Number(result.skipped || 0);
  }
  return { updated, skipped };
}

async function resolvePlayerIdentities(state, players, onProgress) {
  const twitchNames = [
    ...new Set(
      players
        .map((player) =>
          String(player?.name ?? player?.twitchName ?? '')
            .trim()
            .toLowerCase()
        )
        .filter((name) => /^[a-z0-9_]{1,25}$/.test(name))
    ),
  ];
  const totals = { resolved: 0, existing: 0, missing: 0, failed: 0, skipped: 0 };
  const batches = Math.ceil(twitchNames.length / IDENTITY_BATCH_SIZE);

  for (let index = 0; index < twitchNames.length; index += IDENTITY_BATCH_SIZE) {
    const batchNumber = Math.floor(index / IDENTITY_BATCH_SIZE) + 1;
    onProgress(`Resolving Minecraft names ${batchNumber} of ${batches}…`);
    const result = await apiRequest('/api/admin/companion-identities', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': state.auth.user.csrfToken,
      },
      body: JSON.stringify({ twitchNames: twitchNames.slice(index, index + IDENTITY_BATCH_SIZE) }),
    });
    Object.keys(totals).forEach((key) => {
      totals[key] += Number(result[key] || 0);
    });
  }

  return totals;
}

function describeIdentityUpdate(stats) {
  if (!stats) return '';
  const linked = stats.resolved + stats.existing;
  const parts = [`Linked ${linked} Minecraft ${linked === 1 ? 'identity' : 'identities'}`];
  if (stats.resolved) parts.push(`${stats.resolved} newly resolved`);
  if (stats.missing) parts.push(`${stats.missing} not linked to Minecraft`);
  if (stats.failed) parts.push(`${stats.failed} could not be checked`);
  return `${parts.join('; ')}.`;
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

  state.root.addEventListener('submit', async (event) => {
    const submittedForm = event.target;
    if (!submittedForm.matches('[data-companion-wss-form], [data-companion-manual-form]')) return;
    event.preventDefault();
    const submit = submittedForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;

    try {
      if (submittedForm.matches('[data-companion-wss-form]')) {
        const wssUrl = new FormData(submittedForm).get('wssUrl');
        const result = await retrieveCompanions(wssUrl, (message) =>
          setAdminFeedback(state, message)
        );
        setAdminFeedback(state, `Retrieved ${result.players.length} players. Starting upload…`);
        const stats = await uploadPlayers(state, result.streamer, result.players, (message) =>
          setAdminFeedback(state, message)
        );
        let identityStats;
        try {
          identityStats = await resolvePlayerIdentities(state, result.players, (message) =>
            setAdminFeedback(state, message)
          );
        } catch (error) {
          await refreshCurrentCompanionBoard(state, result.streamer);
          throw new Error(
            `The player stats were saved, but Minecraft name resolution stopped. ${
              error instanceof Error ? error.message : 'Please run the update again.'
            }`
          );
        }
        await refreshCurrentCompanionBoard(state, result.streamer);
        setAdminFeedback(
          state,
          `Updated ${stats.updated} players for ${result.streamer}.${
            stats.skipped ? ` Skipped ${stats.skipped} invalid rows.` : ''
          } ${describeIdentityUpdate(identityStats)}`
        );
        return;
      }

      const data = new FormData(submittedForm);
      const streamer = normalizeStreamer(data.get('streamer'), '');
      const player = {
        twitchName: data.get('twitchName'),
        playerName: data.get('playerName'),
        alias: data.get('alias'),
        seasonLevel: Number(data.get('seasonLevel')),
        vaultsJoined: Number(data.get('vaultsJoined')),
      };
      await apiRequest('/api/admin/companion-leaderboard', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': state.auth.user.csrfToken,
        },
        body: JSON.stringify({ streamer, players: [player], source: 'manual-admin' }),
      });
      const twitchName = String(player.twitchName || '').trim();
      let identityStats = null;
      if (twitchName) {
        try {
          identityStats = await resolvePlayerIdentities(state, [{ twitchName }], (message) =>
            setAdminFeedback(state, message)
          );
        } catch (error) {
          await refreshCurrentCompanionBoard(state, streamer);
          throw new Error(
            `${player.playerName} was saved, but the Minecraft name could not be resolved. ${
              error instanceof Error ? error.message : 'Please try again.'
            }`
          );
        }
      }
      await refreshCurrentCompanionBoard(state, streamer);
      setAdminFeedback(
        state,
        `${player.playerName} was added or updated.${
          identityStats ? ` ${describeIdentityUpdate(identityStats)}` : ''
        }`
      );
    } catch (error) {
      setAdminFeedback(
        state,
        error instanceof Error ? error.message : 'The update failed.',
        'error'
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  });
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
  const initial = getInitialOptions();

  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `
    <section class="leaderboard-page" aria-live="polite">
      <header class="leaderboard-page__intro">
        <h2 class="leaderboard-page__title" data-leaderboard-title>Leaderboard</h2>
        <p class="leaderboard-page__lead" data-leaderboard-description></p>
      </header>
      <div class="leaderboard-page__tabs" role="tablist" aria-label="Leaderboard type">
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
      <div data-leaderboard-admin-slot></div>
      <div class="leaderboard-list" data-leaderboard-list></div>
      <div class="leaderboard-page__sentinel" data-leaderboard-sentinel aria-hidden="true"></div>
      <div class="leaderboard-page__controls">
        <button class="leaderboard-page__load-more leaderboard-page__load-more--prev" type="button" data-leaderboard-load-prev hidden>Load 10 previous</button>
        <p class="leaderboard-page__status leaderboard-page__status--muted" data-leaderboard-status>Loading leaderboard…</p>
        <button class="leaderboard-page__load-more leaderboard-page__load-more--next" type="button" data-leaderboard-load-more hidden>Load 10 more</button>
      </div>
    </section>`;

  setFavicon(DEFAULT_FAVICON);
  document.title = 'Vault Hunters Leaderboards';
  setMetaDescription(
    'Compare Vault Hunters unlocked sets, companion season levels, and vaults joined.'
  );
  closeSetDetailModal();

  const root = resultContainer.querySelector('.leaderboard-page');
  const state = {
    sessionId,
    root,
    listEl: root.querySelector('[data-leaderboard-list]'),
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
    proxiedImageUrl,
    escapeHtml,
    updateQueryString,
    usernameInput,
    form,
  };

  bindPage(state);
  updateHeading(state);
  updateUrl(state);

  const authPromise = apiRequest('/api/auth/me')
    .then((auth) => {
      if (sessionId !== activeSessionId) return;
      state.auth = auth;
      renderAdminPanel(state);
    })
    .catch(() => {});

  try {
    await Promise.all([loadPage(state, 'down', { throwOnError: true }), authPromise]);
  } catch (error) {
    if (!state.listEl.childElementCount) {
      state.listEl.innerHTML =
        '<p class="leaderboard-page__error">We could not load this leaderboard. Please try again.</p>';
    }
    throw error;
  }
}
