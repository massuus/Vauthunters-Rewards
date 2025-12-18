// DOM utilities and global constants

// DOM element references
export const form = document.getElementById('search-form');
export const usernameInput = document.getElementById('username');
export const feedback = document.getElementById('feedback');
export const resultContainer = document.getElementById('result');
export const recentContainer = document.getElementById('recent');

// Global constants
export const DEFAULT_FAVICON = 'https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf/64';
export const UNKNOWN_ITEM_IMAGE = '/img/unknown_item.png';
export const defaultTitle = document.title;
export const metaDescriptionEl = document.querySelector('meta[name="description"]');
export const defaultDescription = metaDescriptionEl ? (metaDescriptionEl.getAttribute('content') || '') : '';

/**
 * Set the meta description tag
 */
export function setMetaDescription(text) {
  try {
    if (!metaDescriptionEl) return;
    metaDescriptionEl.setAttribute('content', text || '');
  } catch (_) {}
}

/**
 * Set the favicon to a given URL
 */
export function setFavicon(url) {
  try {
    const link = document.querySelector('link#favicon[rel~="icon"]') || document.querySelector('link[rel~="icon"]');
    if (!link) return;
    // Prefer a small square avatar for favicon
    let href = url || DEFAULT_FAVICON;
    if (href && href.startsWith('https://mc-heads.net/avatar/')) {
      if (!/\/\d+(?:$|\?)/.test(href)) {
        href = href.replace(/\/?$/, '/64');
      }
    }
    // Route through our proxy for consistent caching and SW control
    link.href = proxiedImageUrl(href);
    link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    link.sizes = 'any';
  } catch (_) {
    // ignore
  }
}

/**
 * Get a proxied image URL for caching and proxy control
 */
export function proxiedImageUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'wiki.vaulthunters.gg' || u.hostname === 'mc-heads.net') {
      return `/proxy-img?url=${encodeURIComponent(url)}`;
    }
  } catch (e) {
    // ignore invalid URLs
  }
  return url;
}
