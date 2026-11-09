// URL query string and state management

import { syncActiveNavigation } from '../components/navigation.js';

/**
 * Get the username or query from the query string
 */
export function getUsernameFromQuery() {
  if (/^\/admin\/?$/i.test(window.location.pathname)) return 'admin';
  const { search } = window.location;

  if (!search || search.length <= 1) {
    return '';
  }

  const rawQuery = search.slice(1);
  if (!rawQuery) {
    return '';
  }

  const decode = (value) => {
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      return value;
    }
  };

  // Try standard parameters first
  const params = new URLSearchParams(rawQuery);
  const twitchUsername = params.get('twitchUsername');
  if (twitchUsername) return `twitch:${twitchUsername.trim()}`;
  const leaderboardTarget = params.get('leaderboard');
  if (params.has('leaderboard')) {
    const target = decode(leaderboardTarget || '').trim();
    return target ? `leaderboard:${target}` : 'leaderboard';
  }

  const serverTarget = params.get('server');
  if (serverTarget) {
    return `server:${decode(serverTarget).trim()}`;
  }

  const candidate = params.get('username') || params.get('user') || params.get('name');

  if (candidate) {
    return decode(candidate).trim();
  }

  // Try the first segment (for ?all, ?codes, or ?username format)
  const firstSegment = rawQuery.split('&')[0] || '';

  if (!firstSegment) {
    return '';
  }

  if (firstSegment.includes('=')) {
    const [, value = ''] = firstSegment.split('=');
    return decode(value).trim();
  }

  // Return the raw segment (handles ?all, ?codes, etc.)
  return decode(firstSegment).trim();
}

/**
 * Get the share URL for the current profile
 */
export function getShareUrl(username) {
  const path = window.location.pathname === '/' ? '' : window.location.pathname;
  return `${window.location.origin}${path}?${encodeURIComponent(username)}`;
}

/**
 * Update the query string with the given username
 */
export function updateQueryString(username) {
  const path = window.location.pathname === '/' ? '' : window.location.pathname;
  if (!username) {
    window.history.replaceState({}, '', path || '/');
    syncActiveNavigation();
    return;
  }
  window.history.replaceState({}, '', `${path}?${encodeURIComponent(username)}`);
  syncActiveNavigation();
}
