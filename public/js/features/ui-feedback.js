// UI feedback and loading state management

import { form, feedback, resultContainer, defaultTitle, DEFAULT_FAVICON, setMetaDescription, setFavicon } from '../utils/dom-utils.js';

/**
 * Set the loading state of the search button
 */
export function setLoadingState(isLoading) {
  const button = form.querySelector('button');
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Searching...' : 'Search';
}

/**
 * Clear feedback messages
 */
export function clearFeedback() {
  feedback.textContent = '';
  feedback.classList.remove('error', 'success');
  try { feedback.setAttribute('hidden', ''); } catch (_) {}
}

/**
 * Show a feedback message with optional type (error, success)
 */
export function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.classList.remove('error', 'success');

  if (type) {
    feedback.classList.add(type);
  }
  const hasText = !!(message && String(message).trim());
  try {
    if (hasText) {
      feedback.removeAttribute('hidden');
    } else {
      feedback.setAttribute('hidden', '');
    }
  } catch (_) {}
}

/**
 * Clear the result container and reset UI
 */
export function clearResult() {
  resultContainer.innerHTML = '';
  resultContainer.classList.add('hidden');
  // Clear query string
  window.history.replaceState({}, '', window.location.pathname);
  // Close modal if open
  const modal = document.querySelector('dialog[open]');
  if (modal) {
    modal.close();
  }
  setFavicon(DEFAULT_FAVICON);
  document.title = defaultTitle;
  setMetaDescription('');
}

/**
 * Update share feedback message
 */
export function updateShareFeedback(target, success) {
  if (!target) {
    return;
  }

  target.classList.remove('success', 'error');

  if (success) {
    target.textContent = 'Share link copied!';
    target.classList.add('success');
  } else {
    target.textContent = 'Copy failed. You can copy the link manually.';
    target.classList.add('error');
  }
}
