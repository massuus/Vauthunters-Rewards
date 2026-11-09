// Main application entry point
// This file coordinates all modules and initializes the app

import { logger } from './logger.js';
import { initializeErrorHandlers } from './error-handler.js';
import { preloadTemplates } from '../loaders/template-loader.js';
import { usernameInput } from '../utils/dom-utils.js';
import { initializeSearch } from '../handlers/search-handler.js';
import { renderRecentSection } from '../components/recent-section.js';
import { getUsernameFromQuery } from '../features/url-state.js';
import { initPWAInstall } from '../features/pwa-install.js';
import { initSupportPopup } from '../components/support-popup.js';
import { initPressFeedback } from '../features/press-feedback.js';
import { initNavigation } from '../components/navigation.js';
import { initPlayerSuggestions } from '../components/player-suggestions.js';
import { initSeasonalThemes } from '../features/seasonal-themes.js';
import { initRewardModelPreviews } from '../features/reward-model-preview.js';

/**
 * Initialize the application
 */
async function initializeApp() {
  // Initialize global error handlers first
  initializeErrorHandlers();
  initRewardModelPreviews();
  initSeasonalThemes();

  // Search should be usable immediately, even while templates are loading.
  initializeSearch();
  initPlayerSuggestions();

  // Preload commonly used templates
  try {
    const templates = ['player-card', 'sets-help', 'recent-section', 'loading-skeleton'];
    await preloadTemplates(templates);
  } catch (error) {
    logger.error('Error preloading templates', { error: error.message, stack: error.stack });
  }

  // Mark the current page and enable the responsive navigation menu
  initNavigation();

  // Initialize PWA install prompt
  initPWAInstall();

  // Initialize September support popup
  initSupportPopup();

  // Mirror pressed-state feedback on touch devices for styled buttons and links
  initPressFeedback();

  // Check for preset username from URL
  const presetUsername = getUsernameFromQuery();
  if (presetUsername) {
    usernameInput.value = presetUsername;
    // Dispatch form submit to trigger search
    const form = document.getElementById('search-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  } else {
    // A profile render owns its recents; special pages may intentionally hide them.
    await renderRecentSection();
  }
}

// Register Service Worker for offline caching (images cache-first)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Initialize the app
initializeApp().catch((error) => {
  logger.error('Error initializing app', { error: error.message, stack: error.stack });
});
