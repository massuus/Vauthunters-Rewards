// Client-side configuration constants

// Service Worker Cache Settings
export const CACHE_VERSION = 'v5';
export const STATIC_CACHE_NAME = `vhr-static-${CACHE_VERSION}`;
export const RUNTIME_CACHE_NAME = `vhr-runtime-${CACHE_VERSION}`;

// Cache size limits (number of entries)
export const MAX_RUNTIME_CACHE_SIZE = 100;
export const MAX_IMAGE_CACHE_SIZE = 200;

// Cache TTL settings
export const API_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// UI Interaction Settings
export const SEARCH_DEBOUNCE_MS = 250; // Debounce search form submission
export const ERROR_AUTO_HIDE_MS = 5000; // Auto-hide error messages after 5 seconds

// Static assets to cache
export const STATIC_ASSETS = [
  '/',
  '/pages/index.html',
  '/css/main.css',
  '/js/core/app.js',
  '/data/set-art.json',
];

// Animation durations
export const SKELETON_ANIMATION_DURATION_MS = 1500;
export const IMAGE_FADE_IN_MS = 300;
