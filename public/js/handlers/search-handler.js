// Search form handling and API interaction

import { loadTemplate } from '../loaders/template-loader.js';
import {
  form,
  usernameInput,
  resultContainer,
  DEFAULT_FAVICON,
  defaultTitle,
  setFavicon,
} from '../utils/dom-utils.js';
import {
  setLoadingState,
  clearFeedback,
  showFeedback,
  clearResult,
} from '../features/ui-feedback.js';
import { prepareProfileResources, renderProfile } from '../components/profile-renderer.js';
import { handleSpecialPageSearch } from './search-special-pages.js';
import { maybeShowSpiderSurprise } from '../features/seasonal-themes.js';
import { renderRecentSection } from '../components/recent-section.js';
import { teardownLivePage, teardownLeaderboardPage } from '../components/special-pages.js';

let currentRequestController = null;

function scrollToResults() {
  const header = document.querySelector('.site-header');
  const headerTop = header ? parseFloat(getComputedStyle(header).top) || 0 : 0;
  const offset = header ? header.offsetHeight + headerTop + 16 : 16;
  const target = resultContainer.querySelector('.player-card') || resultContainer;
  window.scrollTo({
    top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset),
    behavior: 'smooth',
  });
}

/**
 * Initialize search form handling
 */
export function initializeSearch() {
  const homeLink = document.querySelector('.site-nav__brand');
  homeLink?.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    // Admin has its own pathname; retain the native link there.
    if (window.location.pathname !== '/') return;
    event.preventDefault();
    currentRequestController?.abort();
    teardownLivePage();
    teardownLeaderboardPage();
    usernameInput.value = '';
    clearFeedback();
    clearResult();
    setLoadingState(false);
    document.querySelector('.site-nav__menu')?.classList.remove('site-nav__menu--open');
    document.querySelector('.site-nav__toggle')?.setAttribute('aria-expanded', 'false');
    document.querySelector('.site-nav__toggle')?.setAttribute('aria-label', 'Open navigation menu');
    window.scrollTo({ top: 0, behavior: 'auto' });
    void renderRecentSection().catch(() => {});
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitSearch().catch(() => {});
  });
}

/**
 * Submit a search for a player
 */
async function submitSearch() {
  const username = usernameInput.value.trim();

  clearFeedback();

  // Cancel any in-flight request to avoid stale renders
  if (currentRequestController) {
    currentRequestController.abort();
  }
  currentRequestController = new AbortController();
  const controller = currentRequestController;

  if (!username) {
    showFeedback('Please enter a Minecraft username.', 'error');
    return;
  }

  const playerLookup = /^[A-Za-z0-9_]{3,16}$/.test(username) || /^twitch\s*:/i.test(username);
  if (await handleSpecialPageSearch(username, { cachedServersOnly: playerLookup })) {
    return;
  }
  if (controller.signal.aborted) return;

  setLoadingState(true);

  try {
    // Overlap artwork and templates with the profile API instead of starting
    // their requests only after the player data arrives.
    void prepareProfileResources().catch(() => {});
    // Reserve space to reduce CLS during loading
    resultContainer.innerHTML = await loadTemplate('loading-skeleton');
    if (controller.signal.aborted) return;
    resultContainer.classList.remove('hidden');
    scrollToResults();
    setFavicon(DEFAULT_FAVICON);
    document.title = defaultTitle;
    const response = await fetch(buildProfileApiUrl(username), {
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        // An uncached server name may also look like a Minecraft username.
        if (playerLookup && (await handleSpecialPageSearch(username))) return;
        throw new Error(
          'Player or linked account not found. Double-check the spelling and try again.'
        );
      }

      if (response.status === 400) {
        throw new Error('Invalid Minecraft or Twitch username.');
      }

      throw new Error('Something went wrong while retrieving the profile.');
    }

    const data = await response.json();
    if (controller.signal.aborted) return;
    await renderProfile(data, { signal: controller.signal });
    if (controller.signal.aborted) return;
    // The recent-player section above the profile can change height during rendering.
    scrollToResults();
    maybeShowSpiderSurprise({ force: username.toLowerCase() === 'damnsecci' });
  } catch (error) {
    if (error?.name === 'AbortError') {
      // Ignore aborted requests triggered by a newer search
      return;
    }
    clearResult();
    showFeedback(error.message, 'error');
  } finally {
    if (controller === currentRequestController) setLoadingState(false);
  }
}

/**
 * Build the API URL for profile requests
 */
function buildProfileApiUrl(username) {
  const base = new URL('/api/profile', window.location.origin);
  const twitchMatch = String(username || '').match(/^twitch\s*:\s*(.+)$/i);
  if (twitchMatch) {
    base.searchParams.set('twitchUsername', twitchMatch[1].trim());
  } else {
    base.searchParams.set('username', username);
  }
  // Pass through a small allowlist of debug params from the page URL
  try {
    const current = new URL(window.location.href);
    ['mock', 'bust'].forEach((k) => {
      if (current.searchParams.has(k)) {
        base.searchParams.set(k, current.searchParams.get(k) || '1');
      }
    });
  } catch {}
  return `${base.pathname}?${base.searchParams.toString()}`;
}
