// Set art catalog loading and upstream shop metadata.

import { mergeApiSets } from './reward-shop.js';
import { logger } from '../core/logger.js';

let setArtStore = {};
let setArtLoadPromise = null;

/**
 * Get the set art store
 */
export function getSetArtStore() {
  return setArtStore;
}

/**
 * Load set art from the set-art.json file
 */
export async function loadSetArt() {
  if (Object.keys(setArtStore).length) {
    return setArtStore;
  }

  if (setArtLoadPromise) {
    return setArtLoadPromise;
  }

  setArtLoadPromise = Promise.all([fetch('/data/set-art.json'), fetchApiSets()])
    .then(async ([response, apiSets]) => {
      if (!response.ok) {
        throw new Error(`Failed to load set art: ${response.status}`);
      }

      const data = await response.json();
      setArtStore = mergeApiSets(data || {}, apiSets);
      return setArtStore;
    })
    .catch((error) => {
      logger.error('Failed to load set art', { error: error.message, stack: error.stack });
      setArtStore = {};
      return setArtStore;
    })
    .finally(() => {
      setArtLoadPromise = null;
    });

  return setArtLoadPromise;
}

async function fetchApiSets() {
  try {
    const response = await fetch('/api/sets');
    if (!response.ok) {
      throw new Error(`Failed to load API sets: ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn('Failed to load API sets, falling back to local set art', {
      error: error.message,
      stack: error.stack,
    });
    return [];
  }
}
