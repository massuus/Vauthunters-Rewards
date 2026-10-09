const PHRASES = [
  'Rambling in the overworld',
  'Sorting far too many jewels',
  'Doing important Vault Hunter things',
  'Probably reorganising storage',
  'Planning the next vault',
  'Definitely not distracted',
];
let refreshTimer;
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
      return `<a class="live-card${streamer.live ? ' is-live' : ''}${streamer.inVault ? ' is-vault' : ''}" href="https://www.twitch.tv/${encodeURIComponent(streamer.login)}" target="_blank" rel="noopener">${avatar(streamer, escapeHtml)}<span class="live-card__body"><span class="live-card__name">${escapeHtml(streamer.displayName)}${streamer.live ? '<span class="live-card__badge">LIVE</span>' : ''}</span><strong class="live-card__activity">${escapeHtml(state.label)}</strong><span class="live-card__detail" data-vault-start="${escapeHtml(streamer.vaultStartedAt || '')}">${escapeHtml(state.detail)}</span></span><span class="live-card__arrow" aria-hidden="true">↗</span></a>`;
    })
    .join('');
}
async function load(container, status, escapeHtml) {
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
  container.innerHTML = `<section class="live-page"><header class="live-page__intro"><h2 class="live-page__title">Vault Hunters Live</h2><p>See who is streaming and who has disappeared into a vault.</p><div class="live-page__status" role="status">Checking the overworld…</div></header><div class="live-grid" aria-live="polite"></div></section>`;
  const grid = container.querySelector('.live-grid');
  const status = container.querySelector('.live-page__status');
  await load(grid, status, escapeHtml);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => load(grid, status, escapeHtml), 60000);
}
export function teardownLivePage() {
  clearInterval(refreshTimer);
  refreshTimer = undefined;
}
