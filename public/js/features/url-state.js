// URL query string and state management

let lastFocusedElement = null;
let modalKeydownHandler = null;

/**
 * Get the username or query from the query string
 */
export function getUsernameFromQuery() {
  const { search } = window.location;

  if (!search || search.length <= 1) {
    return '';
  }

  const rawQuery = search.slice(1);
  if (!rawQuery) {
    return '';
  }

  // Try standard parameters first
  const params = new URLSearchParams(rawQuery);
  const candidate = params.get('username') || params.get('user') || params.get('name');

  const decode = (value) => {
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      return value;
    }
  };

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
    return;
  }
  window.history.replaceState({}, '', `${path}?${encodeURIComponent(username)}`);
}

/**
 * Store the last focused element for modal focus management
 */
export function setLastFocusedElement(element) {
  lastFocusedElement = element;
}

/**
 * Get the last focused element
 */
export function getLastFocusedElement() {
  return lastFocusedElement;
}

/**
 * Set the modal keydown handler for focus management
 */
export function setModalKeydownHandler(handler) {
  modalKeydownHandler = handler;
}

/**
 * Get the modal keydown handler
 */
export function getModalKeydownHandler() {
  return modalKeydownHandler;
}

/**
 * Close the set detail modal if open
 */
export function closeSetDetailModal() {
  const modal = document.querySelector('dialog[open]');
  if (modal) {
    modal.close();
  }
}
