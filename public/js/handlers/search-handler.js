// Search form handling and API interaction

import { SEARCH_DEBOUNCE_MS } from '../utils/config.js';
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
import { renderProfile } from '../components/profile-renderer.js';
import { handleSpecialPageSearch } from './search-special-pages.js';

let submitTimer = null;
let currentRequestController = null;

function scrollToResults() {
  resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Initialize search form handling
 */
export function initializeSearch() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submitTimer) clearTimeout(submitTimer);
    submitTimer = setTimeout(() => {
      submitSearch().catch(() => {});
    }, SEARCH_DEBOUNCE_MS);
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

  if (!username) {
    showFeedback('Please enter a Minecraft username.', 'error');
    return;
  }

  if (await handleSpecialPageSearch(username)) {
    return;
  }

  setLoadingState(true);

  try {
    // Reserve space to reduce CLS during loading
    resultContainer.innerHTML = await loadTemplate('loading-skeleton');
    resultContainer.classList.remove('hidden');
    scrollToResults();
    setFavicon(DEFAULT_FAVICON);
    document.title = defaultTitle;
    const response = await fetch(buildProfileApiUrl(username), {
      signal: currentRequestController.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Player not found. Double-check the spelling and try again.');
      }

      if (response.status === 400) {
        throw new Error(
          'Invalid Minecraft username. Usernames are 3-16 characters without spaces.'
        );
      }

      throw new Error('Something went wrong while retrieving the profile.');
    }

    const data = await response.json();
    await renderProfile(data);
  } catch (error) {
    if (error?.name === 'AbortError') {
      // Ignore aborted requests triggered by a newer search
      return;
    }
    clearResult();
    showFeedback(error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Build the API URL for profile requests
 */
function buildProfileApiUrl(username) {
  const base = new URL('/api/profile', window.location.origin);
  base.searchParams.set('username', username);
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
