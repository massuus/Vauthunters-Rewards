import { renderServerPlayerButton, bindOfficialServersHandlers } from './servers-page.js';

const TIERS = [
  ['Emerald', '/img/badge/emerald.webp'],
  ['Iskallium Diamond', '/img/badge/iskallium-diamond.webp'],
  ['Diamond', '/img/badge/diamond.webp'],
  ['Gold', '/img/badge/gold.webp'],
  ['Iron', '/img/badge/iron.webp'],
];

export function isIskall85PatreonsQuery(value) {
  return [
    'iskall85-patreons',
    'iskall85 patreon',
    'iskall85 patreons',
    'iskall patreon',
    'iskall patreons',
  ].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export function renderIskall85PatreonGroups(patreons, proxiedImageUrl, escapeHtml) {
  return TIERS.map(([tier, badge]) => {
    const members = patreons.filter((player) => player.tier === tier);
    const players = members
      .map((player) => renderServerPlayerButton(player, proxiedImageUrl, escapeHtml))
      .join('');
    return `<section class="patreon-tier-group">
      <h3 class="profile-reward-category"><img class="tier-badge pixelated-image" src="${badge}" alt="" width="24" height="24"> ${tier} (${members.length})</h3>
      ${
        members.length
          ? `<div class="recent-grid official-servers-page__players">${players}</div>`
          : '<p class="official-servers-page__subtext">No linked players are listed for this tier yet.</p>'
      }
    </section>`;
  }).join('');
}

export async function renderIskall85PatreonsPage(
  resultContainer,
  setFavicon,
  setMetaDescription,
  closeSetDetailModal,
  updateQueryString,
  proxiedImageUrl,
  escapeHtml,
  DEFAULT_FAVICON,
  usernameInput,
  form
) {
  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML =
    '<section class="official-servers-page"><p>Loading Iskall85 Patreons...</p></section>';
  setFavicon(DEFAULT_FAVICON);
  document.title = 'Iskall85 Patreons';
  setMetaDescription('Browse Iskall85 Patreons by tier and open their reward profiles.');
  closeSetDetailModal();
  updateQueryString('iskall85-patreons');
  try {
    const response = await fetch('/api/iskall85-patreons');
    if (!response.ok) throw new Error('Failed to load Iskall85 Patreons');
    const patreons = await response.json();
    if (!Array.isArray(patreons)) throw new Error('Invalid Iskall85 Patreon roster');
    resultContainer.innerHTML = `<section class="official-servers-page" aria-live="polite">
      <header class="official-servers-page__intro">
        <h2 class="official-servers-page__title">Iskall85 Patreons</h2>
        <p class="official-servers-page__lead">Select an Iskall85 Patreon supporter to view their rewards.</p>
        <p class="official-servers-page__subtext">${patreons.length} Patreons · highest tier first</p>
      </header>
      ${renderIskall85PatreonGroups(patreons, proxiedImageUrl, escapeHtml)}
    </section>`;
    bindOfficialServersHandlers(resultContainer, usernameInput, form);
  } catch (error) {
    resultContainer.innerHTML =
      '<section class="official-servers-page"><p class="official-servers-page__error">We couldn\'t load the Iskall85 Patreon roster right now. Please try again.</p></section>';
    throw error;
  }
}
