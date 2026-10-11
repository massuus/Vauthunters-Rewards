export const BADGE_CATEGORIES = [
  ['season-1', 'Season 1'],
  ['season-2', 'Season 2'],
  ['season-3', 'Season 3'],
  ['seasonal', 'Seasonal'],
  ['events', 'Special events'],
  ['jackpot', 'Jackpot'],
  ['companion-milestones', 'xK Companions'],
  ['patreon', 'Patreon'],
  ['streaks', 'Streaks'],
  ['special', 'Special & achievements'],
];

export function isBadgesQuery(value) {
  return ['badges', 'badge'].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export function filterBadges(badges, category, search) {
  const query = search.trim().toLowerCase();
  return badges.filter(
    (badge) =>
      (category === 'all' || badge.category === category) &&
      `${badge.name} ${badge.description}`.toLowerCase().includes(query)
  );
}

export async function renderBadgesPage(
  container,
  setFavicon,
  setMetaDescription,
  closeOpenModal,
  updateQueryString,
  escapeHtml,
  defaultFavicon
) {
  closeOpenModal();
  updateQueryString('badges');
  container.classList.remove('hidden');
  document.title = 'Companion Badge Catalog · Vault Hunters Rewards';
  setMetaDescription(
    'Browse companion badges, their icons, and how to earn them by season, event, Patreon tier, and streak.'
  );
  setFavicon(defaultFavicon);
  container.innerHTML = '<p role="status">Loading companion badges…</p>';
  try {
    const response = await fetch('/api/badges');
    if (!response.ok) throw new Error('Badge catalog unavailable');
    const { badges } = await response.json();
    if (!Array.isArray(badges)) throw new Error('Invalid badge catalog');
    container.innerHTML = `<section class="badges-page">
      <header class="badges-page__intro"><h2>Companion Badge Catalog</h2>
        <p>Explore the badges and how to earn them. Descriptions come from the Vault Hunters companion extension.</p>
      </header>
      <div class="badges-page__filters">
        <label>Search badges<input type="search" data-badge-search placeholder="Name or how to earn it" autocomplete="off"></label>
        <label>Category<select data-badge-category><option value="all">All categories (${badges.length})</option>${BADGE_CATEGORIES.map(([id, name]) => `<option value="${id}">${name} (${badges.filter((badge) => badge.category === id).length})</option>`).join('')}</select></label>
      </div>
      <p class="badges-page__count" role="status" data-badge-count></p>
      <div data-badge-results></div>
    </section>`;
    const search = container.querySelector('[data-badge-search]');
    const category = container.querySelector('[data-badge-category]');
    const results = container.querySelector('[data-badge-results]');
    const count = container.querySelector('[data-badge-count]');
    const render = () => {
      const filtered = filterBadges(badges, category.value, search.value);
      count.textContent = `${filtered.length} of ${badges.length} badges`;
      if (!filtered.length) {
        results.innerHTML = `<p class="badges-page__empty">${category.value === 'season-3' && !search.value.trim() ? 'No Season 3 badges are listed in the current companion catalog yet.' : 'No badges match. Try another search or category.'}</p>`;
        return;
      }
      results.innerHTML = BADGE_CATEGORIES.map(([id, name]) => {
        const group = filtered
          .filter((badge) => badge.category === id)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (!group.length) return '';
        return `<section class="badges-page__group"><h3>${name}<span>${group.length}</span></h3><div class="badge-grid">${group.map((badge) => `<article class="badge-card"><img src="${escapeHtml(badge.image)}" alt="${escapeHtml(badge.name)} badge" width="64" height="64" loading="lazy" decoding="async"><div><h4>${escapeHtml(badge.name)}</h4><p>${escapeHtml(badge.description)}</p></div></article>`).join('')}</div></section>`;
      }).join('');
    };
    search.addEventListener('input', render);
    category.addEventListener('change', render);
    render();
  } catch {
    container.innerHTML =
      '<p role="alert">We couldn’t load the badge catalog. Please refresh and try again.</p>';
  }
}
