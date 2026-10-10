const PHRASES = [
  'Rambling in the overworld',
  'Sorting far too many jewels',
  'Doing important Vault Hunter things',
  'Probably reorganising storage',
  'Planning the next vault',
  'Definitely not distracted',
];
let officialRefreshTimer;
let communityRefreshTimer;

export function isLiveQuery(value) {
  return value.toLowerCase() === 'live';
}

function phraseFor(login, now) {
  const bucket = Math.floor(now / 900000);
  let value = bucket;
  for (const character of login) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return PHRASES[value % PHRASES.length];
}

function duration(from, now) {
  const ms = now - Date.parse(from || '');
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60000);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function clockTime(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(date);
}

function activity(streamer, stale, now) {
  if (stale) return { label: 'Lost in the fog', detail: 'Status unavailable' };
  if (!streamer.live) return { label: 'Taking a break', detail: 'Offline' };
  if (streamer.inVault) {
    const elapsed = duration(streamer.vaultStartedAt, now);
    const started = clockTime(streamer.vaultStartedAt);
    return {
      label: 'Running a vault',
      detail: started
        ? `Started around ${started}${elapsed ? ` · ${elapsed} ago` : ''}`
        : 'In vault',
    };
  }
  if (streamer.joinWindowOpen)
    return { label: 'Preparing the next vault', detail: 'Join window open' };
  if (!streamer.connected)
    return { label: 'Up to something', detail: 'Live · vault status unavailable' };
  return { label: phraseFor(streamer.login, now), detail: 'Live · outside a vault' };
}

function avatar(streamer, escapeHtml) {
  return streamer.profileImageUrl
    ? `<img class="live-card__avatar" src="${escapeHtml(streamer.profileImageUrl)}" alt="" width="44" height="44" loading="lazy" decoding="async">`
    : `<span class="live-card__avatar" aria-hidden="true">${escapeHtml(streamer.displayName.slice(0, 1))}</span>`;
}

function renderCards(container, payload, escapeHtml) {
  const now = Date.now();
  const sorted = [...payload.streamers].sort(
    (a, b) =>
      Number(b.inVault) - Number(a.inVault) ||
      Number(b.live) - Number(a.live) ||
      a.displayName.localeCompare(b.displayName)
  );
  container.innerHTML = sorted
    .map((streamer) => {
      const state = activity(streamer, payload.stale, now);
      const login = encodeURIComponent(streamer.login);
      return `<article class="live-card${streamer.live ? ' is-live' : ''}${streamer.inVault ? ' is-vault' : ''}">${avatar(streamer, escapeHtml)}<span class="live-card__body"><span class="live-card__name">${escapeHtml(streamer.displayName)}${streamer.live ? '<span class="live-card__badge">LIVE</span>' : ''}</span><strong class="live-card__activity">${escapeHtml(state.label)}</strong><span class="live-card__detail" data-vault-start="${escapeHtml(streamer.vaultStartedAt || '')}">${escapeHtml(state.detail)}</span></span><span class="live-card__actions"><a href="https://www.twitch.tv/${login}" target="_blank" rel="noopener">Watch</a><a href="?leaderboard&amp;metric=seasonLevel&amp;streamer=${login}">Leaderboard</a></span></article>`;
    })
    .join('');
}

function renderCommunityCards(container, payload, escapeHtml) {
  if (!payload.streamers.length) {
    container.innerHTML =
      '<div class="live-page__empty">No community Vault Hunters streams found right now.</div>';
    return;
  }
  container.innerHTML = payload.streamers
    .map((streamer) => {
      const preview = streamer.previewImageUrl
        ? `<img class="community-card__preview" src="${escapeHtml(streamer.previewImageUrl)}" alt="" width="440" height="248" loading="lazy" decoding="async">`
        : '<span class="community-card__preview community-card__preview--empty"></span>';
      const liveFor = duration(streamer.startedAt, Date.now());
      const details = [
        `${Number(streamer.viewerCount || 0).toLocaleString()} watching`,
        streamer.language ? String(streamer.language).toUpperCase() : '',
        liveFor ? `Live ${liveFor}` : '',
      ].filter(Boolean);
      return `<a class="community-card" href="https://www.twitch.tv/${encodeURIComponent(streamer.login)}" target="_blank" rel="noopener">${preview}<span class="community-card__body"><span class="community-card__name">${escapeHtml(streamer.displayName)}<span class="live-card__badge">LIVE</span></span><span class="community-card__title">${escapeHtml(streamer.title || 'Vault Hunters')}</span><span class="community-card__detail">${escapeHtml(details.join(' · '))}</span></span></a>`;
    })
    .join('');
}

async function loadOfficial(container, status, escapeHtml) {
  try {
    const response = await fetch('/api/live-status', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    renderCards(container, payload, escapeHtml);
    const liveCount = payload.streamers.filter((row) => row.live).length;
    status.textContent = payload.stale
      ? 'The latest signal is old, so live activity is hidden until it reconnects.'
      : `${liveCount} Vault Hunter${liveCount === 1 ? '' : 's'} live right now · updated ${duration(payload.checkedAt, Date.now()) || 'just now'} ago`;
  } catch {
    container.innerHTML =
      '<div class="live-page__empty">The live tracker is lost in the fog. Try again soon.</div>';
    status.textContent = 'Live status unavailable';
  }
}

async function loadCommunity(container, status, escapeHtml) {
  try {
    const response = await fetch('/api/community-live', {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    renderCommunityCards(container, payload, escapeHtml);
    const count = payload.streamers.length;
    status.textContent = `${count} community stream${count === 1 ? '' : 's'} found`;
  } catch {
    container.innerHTML =
      '<div class="live-page__empty">Community streams are hiding in the fog. Try again soon.</div>';
    status.textContent = 'Community discovery unavailable';
  }
}

export async function renderLivePage(
  container,
  setFavicon,
  setMetaDescription,
  closeOpenModal,
  updateQueryString,
  escapeHtml,
  defaultFavicon
) {
  closeOpenModal();
  updateQueryString('live');
  container.classList.remove('hidden');
  document.title = 'Vault Hunters Live';
  setMetaDescription(
    'See which Vault Hunters are live and whether they are currently running a vault.'
  );
  setFavicon(defaultFavicon);
  container.innerHTML = `<section class="live-page"><header class="live-page__intro"><h2 class="live-page__title">Vault Hunters Live</h2><p>See who is streaming and who has disappeared into a vault.</p><div class="live-page__status" role="status" data-official-status>Checking the overworld…</div></header><div class="live-grid" data-official-grid aria-live="polite"></div><section class="community-live"><header class="community-live__heading"><div><h3>Vault Hunters Community</h3><p>More people playing Vault Hunters live on Twitch.</p></div><span class="live-page__status" data-community-status>Searching Twitch…</span></header><div class="community-grid" data-community-grid aria-live="polite"></div></section></section>`;
  const grid = container.querySelector('[data-official-grid]');
  const status = container.querySelector('[data-official-status]');
  const communityGrid = container.querySelector('[data-community-grid]');
  const communityStatus = container.querySelector('[data-community-status]');
  await Promise.all([
    loadOfficial(grid, status, escapeHtml),
    loadCommunity(communityGrid, communityStatus, escapeHtml),
  ]);
  clearInterval(officialRefreshTimer);
  clearInterval(communityRefreshTimer);
  officialRefreshTimer = setInterval(() => loadOfficial(grid, status, escapeHtml), 60000);
  communityRefreshTimer = setInterval(
    () => loadCommunity(communityGrid, communityStatus, escapeHtml),
    5 * 60000
  );
}

export function teardownLivePage() {
  clearInterval(officialRefreshTimer);
  clearInterval(communityRefreshTimer);
  officialRefreshTimer = undefined;
  communityRefreshTimer = undefined;
}
