import { renderServerPlayerButton, bindOfficialServersHandlers } from './servers-page.js';

const TIERS = [
  ['Vault Legend', '/img/badge/legend.webp'],
  ['Vault Champion', '/img/badge/champion.webp'],
  ['Vault Goblin', '/img/badge/goblin.webp'],
  ['Vault Cheeser', '/img/badge/cheeser.webp'],
  ['Vault Dweller', '/img/badge/dweller.webp'],
];

export function isPatreonsQuery(value) {
  return ['patreon', 'patreons', 'patrons'].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export function renderPatreonGroups(patreons, proxiedImageUrl, escapeHtml) {
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

export async function renderPatreonsPage(
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
    '<section class="official-servers-page"><p>Loading Patreons...</p></section>';
  setFavicon(DEFAULT_FAVICON);
  document.title = 'Vault Hunters Patreons';
  setMetaDescription('Browse Vault Hunters Patreons by tier and open their reward profiles.');
  closeSetDetailModal();
  updateQueryString('patreons');

  try {
    const response = await fetch('/api/patreons');
    if (!response.ok) throw new Error('Failed to load Patreons');
    const patreons = await response.json();
    if (!Array.isArray(patreons)) throw new Error('Invalid Patreon roster');
    resultContainer.innerHTML = `<section class="official-servers-page" aria-live="polite">
      <header class="official-servers-page__intro">
        <h2 class="official-servers-page__title">Vault Hunters Patreons</h2>
        <p class="official-servers-page__lead">Select a Patreon supporter to view their rewards.</p>
        <p class="official-servers-page__subtext">${patreons.length} Patreons · highest tier first</p>
      </header>
      ${renderPatreonGroups(patreons, proxiedImageUrl, escapeHtml)}
    </section>`;
    bindOfficialServersHandlers(resultContainer, usernameInput, form);
  } catch (error) {
    resultContainer.innerHTML =
      '<section class="official-servers-page"><p class="official-servers-page__error">We couldn\'t load the Patreon roster right now. Please try again.</p></section>';
    throw error;
  }
}
