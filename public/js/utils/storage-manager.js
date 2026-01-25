// LocalStorage management for recent users and seen sets

const RECENT_USERS_KEY = 'vh.recentUsers';
const SEEN_SETS_KEY_PREFIX = 'vh.seenSets.';

/**
 * Get the list of recent users from storage
 */
export function getRecentUsers() {
  try {
    const raw = localStorage.getItem(RECENT_USERS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // sanitize
    return list
      .map((x) => ({ 
        name: String(x?.name || '').trim(), 
        head: String(x?.head || ''),
        tier: Array.isArray(x?.tier) ? x.tier : []
      }))
      .filter((x) => x.name);
  } catch {
    return [];
  }
}

/**
 * Save the list of recent users to storage
 */
export function saveRecentUsers(users) {
  try {
    localStorage.setItem(RECENT_USERS_KEY, JSON.stringify(users || []));
  } catch {}
}

/**
 * Add a user to the recent users list
 */
export function addRecentUser(user) {
  try {
    const name = typeof user === 'string' ? user : String(user?.name || '').trim();
    const head = typeof user === 'string' ? '' : String(user?.head || '');
    const tier = typeof user === 'string' ? [] : Array.isArray(user?.tier) ? user.tier : [];
    if (!name) return;
    const key = name.toLowerCase();
    const existing = getRecentUsers().filter((u) => u.name.toLowerCase() !== key);
    const next = [{ name, head, tier }, ...existing].slice(0, 4);
    saveRecentUsers(next);
  } catch {}
}

/**
 * Get the set of seen set IDs from storage for a specific player
 */
export function getSeenSets(username) {
  try {
    if (!username) return new Set();
    const raw = localStorage.getItem(`${SEEN_SETS_KEY_PREFIX}${username}`);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.filter((v) => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

/**
 * Save the set of seen set IDs to storage for a specific player
 */
export function setSeenSets(username, seenSets) {
  try {
    if (!username) return;
    const arr = Array.from(seenSets || []);
    localStorage.setItem(`${SEEN_SETS_KEY_PREFIX}${username}`, JSON.stringify(arr));
  } catch {
    // ignore storage errors (quota, privacy mode, etc.)
  }
}
