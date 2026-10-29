import { renderServerPlayerButton, bindOfficialServersHandlers } from './servers-page.js';

export function isDevelopersQuery(value) {
  return ['dev', 'devs'].includes(
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export async function renderDevelopersPage(
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
    '<section class="official-servers-page"><p>Loading developers...</p></section>';
  setFavicon(DEFAULT_FAVICON);
  document.title = 'Vault Hunters Developers';
  setMetaDescription('Browse the Vault Hunters developer roster and open their reward profiles.');
  closeSetDetailModal();
  updateQueryString('devs');

  try {
    const response = await fetch('/api/developers');
    if (!response.ok) throw new Error('Failed to load developers');
    const developers = await response.json();
    if (!Array.isArray(developers)) throw new Error('Invalid developer roster');
    const players = developers
      .map((player) => renderServerPlayerButton(player, proxiedImageUrl, escapeHtml))
      .join('');
    resultContainer.innerHTML = `
      <section class="official-servers-page" aria-live="polite">
        <header class="official-servers-page__intro">
          <h2 class="official-servers-page__title">Vault Hunters Developers</h2>
          <p class="official-servers-page__lead">Select a developer to view their rewards.</p>
          <p class="official-servers-page__subtext">${developers.length} developers</p>
        </header>
        <div class="recent-grid official-servers-page__players">${players}</div>
      </section>`;
    bindOfficialServersHandlers(resultContainer, usernameInput, form);
  } catch (error) {
    resultContainer.innerHTML =
      '<section class="official-servers-page"><p class="official-servers-page__error">We couldn\'t load the developers right now. Please try again.</p></section>';
    throw error;
  }
}
