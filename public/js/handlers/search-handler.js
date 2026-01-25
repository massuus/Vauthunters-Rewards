// Search form handling and API interaction

import { SEARCH_DEBOUNCE_MS } from '../utils/config.js';
import { loadTemplate } from '../loaders/template-loader.js';
import { form, usernameInput, resultContainer, DEFAULT_FAVICON, defaultTitle, setFavicon, setMetaDescription, proxiedImageUrl } from '../utils/dom-utils.js';
import { setLoadingState, clearFeedback, showFeedback, clearResult } from '../features/ui-feedback.js';
import { renderProfile } from '../components/profile-renderer.js';
import { isCodesQuery, isAllQuery, renderCodesPage, renderAllRewardsPage } from '../components/special-pages.js';
import { escapeHtml, formatLabel } from '../features/reward-utils.js';

let submitTimer = null;
let currentRequestController = null;

/**
 * Initialize search form handling
 */
export function initializeSearch() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (submitTimer) clearTimeout(submitTimer);
    submitTimer = setTimeout(() => { submitSearch().catch(() => {}); }, SEARCH_DEBOUNCE_MS);
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

  if (isCodesQuery(username)) {
    setLoadingState(true);
    try {
      await renderCodesPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        () => {
          const modal = document.querySelector('dialog[open]');
          if (modal) modal.close();
        },
        (qs) => {
          if (!qs) {
            window.history.replaceState({}, '', window.location.pathname);
          } else {
            window.history.replaceState({}, '', `${window.location.pathname}?${qs}`);
          }
        },
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON
      );
    } catch {
      showFeedback('Unable to load the reward codes right now. Please try again in a moment.', 'error');
    } finally {
      setLoadingState(false);
    }
    return;
  }

  if (isAllQuery(username)) {
    setLoadingState(true);
    try {
      await renderAllRewardsPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        () => {
          const modal = document.querySelector('dialog[open]');
          if (modal) modal.close();
        },
        (qs) => {
          if (!qs) {
            window.history.replaceState({}, '', window.location.pathname);
          } else {
            window.history.replaceState({}, '', `${window.location.pathname}?${qs}`);
          }
        },
        proxiedImageUrl,
        escapeHtml,
        formatLabel,
        DEFAULT_FAVICON
      );
    } catch {
      showFeedback('Unable to load all rewards right now. Please try again in a moment.', 'error');
    } finally {
      setLoadingState(false);
    }
    return;
  }

  setLoadingState(true);

  try {
    // Reserve space to reduce CLS during loading
    resultContainer.innerHTML = await loadTemplate('loading-skeleton');
    resultContainer.classList.remove('hidden');
    setFavicon(DEFAULT_FAVICON);
    document.title = defaultTitle;
    const response = await fetch(buildProfileApiUrl(username), { signal: currentRequestController.signal });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Player not found. Double-check the spelling and try again.');
      }

      if (response.status === 400) {
        throw new Error('Invalid Minecraft username. Usernames are 3-16 characters without spaces.');
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
