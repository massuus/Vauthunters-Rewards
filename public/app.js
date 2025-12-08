// Main application entry point
// This file coordinates all modules and initializes the app

import { preloadTemplates } from './template-loader.js';
import { usernameInput } from './dom-utils.js';
import { initializeSearch } from './search-handler.js';
import { renderRecentSection } from './recent-section.js';
import { getUsernameFromQuery } from './url-state.js';


/**
 * Initialize the application
 */
async function initializeApp() {
  // Preload commonly used templates
  try {
    const templates = ['player-card', 'sets-help', 'recent-section', 'loading-skeleton', 'set-modal'];
    await preloadTemplates(templates);
  } catch (error) {
    console.error('Error preloading templates:', error);
  }

  // Initialize search form handling
  initializeSearch();

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
  console.error('Error initializing app:', error);
});


