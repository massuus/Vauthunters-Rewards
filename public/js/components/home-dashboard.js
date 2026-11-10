import { escapeHtml } from '../features/reward-utils.js';
import { proxiedImageUrl } from '../utils/dom-utils.js';
import { fetchCodesData, isCodeExpired } from './special-pages/codes-page.js';

let controller;
let refreshTimer;

export function hideHomeDashboard() {
  controller?.abort();
  clearInterval(refreshTimer);
  document.body?.classList.remove('is-home-dashboard');
  document.querySelectorAll('.home-sidebar').forEach((panel) => panel.remove());
}

export function showHomeDashboard() {
  hideHomeDashboard();
  const main = document.querySelector('main.main');
  if (!main) return;
  document.body.classList.add('is-home-dashboard');
  controller = new AbortController();
  const signal = controller.signal;
  const live = document.createElement('aside');
  live.className = 'home-sidebar home-sidebar--live';
  live.setAttribute('aria-label', 'Now live');
  live.innerHTML = `<header class="home-sidebar__header"><span class="home-eyebrow">On Twitch</span><h2>Now live<span class="home-live-dot" aria-hidden="true"></span></h2></header><section><h3>Vault Crafters</h3><div data-home-official><p class="home-empty">Checking live streams...</p></div></section><section><h3>Community</h3><div data-home-community><p class="home-empty">Checking live streams...</p></div></section><p class="home-sidebar__foot">Want to appear here? Add <strong>vh3</strong> to your Twitch stream tags.</p><a class="home-text-link" href="?live">All live streams &rarr;</a>`;
  const rewards = document.createElement('aside');
  rewards.className = 'home-sidebar home-sidebar--rewards';
  rewards.setAttribute('aria-label', 'New rewards');
  rewards.innerHTML = `<header class="home-sidebar__header"><span class="home-eyebrow">The latest additions</span><h2>New rewards</h2></header><div data-home-rewards><p class="home-empty">Loading rewards...</p></div><a class="home-button" href="?all">Explore all rewards</a><section data-home-codes hidden></section>`;
  main.append(live, rewards);
  const loadLive = async (url, target, official) => {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (signal.aborted) return;
      if (data.stale) throw new Error();
      const streamers = (data.streamers || []).filter((row) => !official || row.live);
      target.innerHTML =
        streamers
          .map(
            (row) =>
              `<a class="home-stream" href="https://www.twitch.tv/${encodeURIComponent(row.login)}" target="_blank" rel="noopener">${row.profileImageUrl ? `<img src="${escapeHtml(proxiedImageUrl(row.profileImageUrl))}" width="36" height="36" alt="" loading="lazy">` : '<span class="home-stream__placeholder" aria-hidden="true">&#9679;</span>'}<span><strong>${escapeHtml(row.displayName || row.login)}</strong><small>${escapeHtml(official ? (row.inVault ? 'Running a vault' : 'Live on Twitch') : row.title || 'Vault Hunters')}</small>${official ? '' : `<span class="home-stream__meta"><span>${Number(row.viewerCount || 0).toLocaleString()} viewer${Number(row.viewerCount || 0) === 1 ? '' : 's'}</span>${row.language ? `<span>${escapeHtml(String(row.language).toUpperCase())}</span>` : ''}</span>`}</span></a>`
          )
          .join('') || '<p class="home-empty">No streams live right now.</p>';
    } catch {
      if (!signal.aborted)
        target.innerHTML = '<p class="home-empty">Live status is unavailable.</p>';
    }
  };
  const refresh = () => {
    if (document.hidden || signal.aborted) return;
    void loadLive('/api/live-status', live.querySelector('[data-home-official]'), true);
    void loadLive('/api/community-live', live.querySelector('[data-home-community]'), false);
  };
  refresh();
  refreshTimer = setInterval(refresh, 60000);
  void Promise.all([
    fetch('/api/sets?source=rewards', { signal }).then((response) => {
      if (!response.ok) throw new Error('Rewards API unavailable');
      return response.json();
    }),
    fetch('/data/set-art.json', { signal }).then((response) => {
      if (!response.ok) throw new Error('Catalog unavailable');
      return response.json();
    }),
  ])
    .then(([apiRewards, artwork]) => {
      if (signal.aborted) return;
      const apiById = new Map(
        (Array.isArray(apiRewards) ? apiRewards : [])
          .filter((reward) => reward && typeof reward.id === 'string')
          .map((reward) => [reward.id, reward])
      );
      const entries = Object.entries(artwork)
        .filter(([id, local]) => apiById.has(id) && !local.profileOnly)
        .map(([id, local]) => ({ ...apiById.get(id), local }))
        .reverse()
        .slice(0, 5);
      rewards.querySelector('[data-home-rewards]').innerHTML =
        entries
          .map((reward) => {
            const local = reward.local;
            return `<a class="home-reward" href="?all"><img src="${escapeHtml(proxiedImageUrl(local.image || '/img/unknown_item.png'))}" width="52" height="52" alt="" loading="lazy"><span><strong>${escapeHtml(reward.displayName || local.label || reward.id)}</strong><small>${escapeHtml(reward.category || local.category || 'Reward')}</small></span></a>`;
          })
          .join('') ||
        '<p class="home-empty">Explore the reward collection for all available rewards.</p>';
    })
    .catch(() => {
      if (!signal.aborted)
        rewards.querySelector('[data-home-rewards]').innerHTML =
          '<p class="home-empty">Rewards are unavailable right now.</p>';
    });
  void fetchCodesData()
    .then((codes) => {
      if (signal.aborted) return;
      const active = codes.filter((code) => code.code && !isCodeExpired(code.expires));
      if (!active.length) return;
      const section = rewards.querySelector('[data-home-codes]');
      section.hidden = false;
      section.innerHTML = `<h3>Active reward codes</h3><p>${active.length} code${active.length === 1 ? '' : 's'} available to redeem</p><a class="home-button" href="?codes">View active codes</a>`;
    })
    .catch(() => {});
}
