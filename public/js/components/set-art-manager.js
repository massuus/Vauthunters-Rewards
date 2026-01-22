// Set art loading and modal management

import { logger } from '../core/logger.js';
import { loadTemplate } from '../loaders/template-loader.js';
import { proxiedImageUrl, UNKNOWN_ITEM_IMAGE, resultContainer } from '../utils/dom-utils.js';
import { formatLabel, escapeHtml } from '../features/reward-utils.js';
import { getLastFocusedElement, setLastFocusedElement, getModalKeydownHandler, setModalKeydownHandler } from '../features/url-state.js';

let setArtStore = {};
let setArtLoadPromise = null;
let setModalElements = null;

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

  setArtLoadPromise = fetch('/data/set-art.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load set art: ${response.status}`);
      }

      return response.json();
    })
    .then((data) => {
      setArtStore = data || {};
      return setArtStore;
    })
    .catch((error) => {
      logger.error('Failed to load set art', { error: error.message, stack: error.stack });
      setArtStore = {};
      return setArtStore;
    });

  return setArtLoadPromise;
}

/**
 * Ensure the set detail modal is loaded and ready
 */
async function ensureSetDetailModal() {
  if (setModalElements) {
    return setModalElements;
  }

  const modalTemplate = await loadTemplate('set-modal');
  const temp = document.createElement('div');
  temp.innerHTML = modalTemplate;
  const overlay = temp.firstElementChild;

  document.body.appendChild(overlay);

  const elements = {
    overlay,
    backdrop: overlay.querySelector('.set-modal__backdrop'),
    content: overlay.querySelector('.set-modal__content'),
    close: overlay.querySelector('.set-modal__close'),
    imagesContainer: overlay.querySelector('.set-modal__images'),
    title: overlay.querySelector('.set-modal__title'),
    description: overlay.querySelector('.set-modal__description')
  };

  elements.backdrop.addEventListener('click', closeSetDetailModal);
  elements.close.addEventListener('click', closeSetDetailModal);

  setModalElements = elements;
  return elements;
}

/**
 * Open the set detail modal for a given set key
 */
export async function openSetDetailModal(setKey, isOwned = true) {
  const modal = await ensureSetDetailModal();
  const asset = setArtStore?.[setKey] || {};
  const label = asset.label || formatLabel(setKey);
  const description = isOwned 
    ? (asset.descriptionObtained || asset.description || `You obtained this by unlocking the ${label}.`)
    : (asset.descriptionLocked || asset.description || `Unlock the ${label}.`);

  // Support both single image and multiple images
  let imageSources = [];
  if (asset.images && Array.isArray(asset.images)) {
    imageSources = asset.images;
  } else if (asset.image) {
    imageSources = [asset.image];
  } else {
    imageSources = [UNKNOWN_ITEM_IMAGE];
  }

  // Clear previous images
  modal.imagesContainer.innerHTML = '';

  // Add all images to the modal
  imageSources.forEach((imageSource, index) => {
    const isFallbackImage = imageSource === UNKNOWN_ITEM_IMAGE;
    const proxied = proxiedImageUrl(imageSource);
    
    const img = document.createElement('img');
    img.className = 'set-modal__image';
    if (isFallbackImage) {
      img.classList.add('pixelated-image');
    }
    img.src = proxied;
    img.alt = asset.alt || label;
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.setAttribute('decoding', 'async');
    img.setAttribute('fetchpriority', 'low');
    img.setAttribute('width', '96');
    img.setAttribute('height', '96');
    
    img.onerror = () => {
      img.onerror = null;
      img.src = imageSource;
      img.setAttribute('referrerpolicy', 'no-referrer');
    };
    
    modal.imagesContainer.appendChild(img);
  });

  modal.title.textContent = label;
  modal.description.textContent = description;

  modal.overlay.classList.remove('hidden');

  const lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setLastFocusedElement(lastFocused);
  modal.content.focus();

  let handler = getModalKeydownHandler();
  if (handler) {
    window.removeEventListener('keydown', handler);
  }

  handler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSetDetailModal();
    }
  };

  setModalKeydownHandler(handler);
  window.addEventListener('keydown', handler);
}

/**
 * Close the set detail modal
 */
export function closeSetDetailModal() {
  if (!setModalElements || setModalElements.overlay.classList.contains('hidden')) {
    return;
  }

  setModalElements.overlay.classList.add('hidden');

  let handler = getModalKeydownHandler();
  if (handler) {
    window.removeEventListener('keydown', handler);
    setModalKeydownHandler(null);
  }

  const lastFocused = getLastFocusedElement();
  if (lastFocused) {
    lastFocused.focus();
    setLastFocusedElement(null);
  }
}
