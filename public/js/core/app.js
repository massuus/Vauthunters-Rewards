// Main application entry point
// This file coordinates all modules and initializes the app

import { logger } from './logger.js';
import { initializeErrorHandlers } from './error-handler.js';
import { preloadTemplates } from '../loaders/template-loader.js';
import { usernameInput } from '../utils/dom-utils.js';
import { initializeSearch } from '../handlers/search-handler.js';
import { renderRecentSection } from '../components/recent-section.js';
import { getUsernameFromQuery } from '../features/url-state.js';
import { initLazyImages } from '../loaders/image-loader.js';
import { initPWAInstall } from '../features/pwa-install.js';
import { initRewardCodesPopup } from '../components/reward-codes-popup.js';

/**
 * Initialize the application
 */
async function initializeApp() {
  // Initialize global error handlers first
  initializeErrorHandlers();

  // Preload commonly used templates
  try {
    const templates = [
      'player-card',
      'sets-help',
      'recent-section',
      'loading-skeleton',
      'set-modal',
    ];
    await preloadTemplates(templates);
  } catch (error) {
    logger.error('Error preloading templates', { error: error.message, stack: error.stack });
  }

  // Initialize search form handling
  initializeSearch();

  // Initialize lazy image loading
  initLazyImages();

  // Initialize PWA install prompt
  initPWAInstall();

  // Initialize reward codes popup
  initRewardCodesPopup();

  // Check for preset username from URL
  const presetUsername = getUsernameFromQuery();
  if (presetUsername) {
    usernameInput.value = presetUsername;
    // Dispatch form submit to trigger search
    const form = document.getElementById('search-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  // Render recents on first load
  await renderRecentSection();
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
