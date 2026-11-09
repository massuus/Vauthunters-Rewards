import { renderPlayerButton, bindPlayerButtons } from './player-roster.js';

export function renderPatreonTierGroups(tiers, patreons, proxiedImageUrl, escapeHtml) {
  return tiers
    .map(([tier, badge]) => {
      const members = patreons.filter((player) => player.tier === tier);
      const players = members
        .map((player) => renderPlayerButton(player, proxiedImageUrl, escapeHtml))
        .join('');
      return `<section class="patreon-tier-group">
      <h3 class="profile-reward-category"><img class="tier-badge pixelated-image" src="${badge}" alt="" width="24" height="24"> ${tier} (${members.length})</h3>
      ${
        members.length
          ? `<div class="recent-grid official-servers-page__players">${players}</div>`
          : '<p class="official-servers-page__subtext">No linked players are listed for this tier yet.</p>'
      }
    </section>`;
    })
    .join('');
}

export async function renderPatreonRosterPage(
  config,
  resultContainer,
  setFavicon,
  setMetaDescription,
  updateQueryString,
  proxiedImageUrl,
  escapeHtml,
  DEFAULT_FAVICON,
  usernameInput,
  form,
  { signal } = {}
) {
  if (signal?.aborted) return;
  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `<section class="official-servers-page"><p>Loading ${config.requestName}...</p></section>`;
  setFavicon(DEFAULT_FAVICON);
  document.title = config.title;
  setMetaDescription(config.description);
  updateQueryString(config.query);

  try {
    const response = await fetch(config.endpoint, { signal });
    if (signal?.aborted) return;
    if (!response.ok) throw new Error(`Failed to load ${config.requestName}`);
    const patreons = await response.json();
    if (signal?.aborted) return;
    if (!Array.isArray(patreons)) throw new Error(`Invalid ${config.rosterName} roster`);
    resultContainer.innerHTML = `<section class="official-servers-page" aria-live="polite">
      <header class="official-servers-page__intro">
        <h2 class="official-servers-page__title">${config.title}</h2>
        <p class="official-servers-page__lead">${config.lead}</p>
        <p class="official-servers-page__subtext">${patreons.length} Patreons · highest tier first</p>
      </header>
      ${renderPatreonTierGroups(config.tiers, patreons, proxiedImageUrl, escapeHtml)}
    </section>`;
    bindPlayerButtons(resultContainer, usernameInput, form);
  } catch (error) {
    if (signal?.aborted) return;
    resultContainer.innerHTML = `<section class="official-servers-page"><p class="official-servers-page__error">We couldn't load the ${config.rosterName} roster right now. Please try again.</p></section>`;
    throw error;
  }
}
