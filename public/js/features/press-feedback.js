const PRESSABLE_SELECTOR = [
  '.search__form > button[type="submit"]',
  '.share-button',
  '.share-link-button',
  '.player-info-button',
  '.section-info-button',
  '.extra-toggle',
  '.search .recent-item',
  '.codes-card__vod',
  '.codes-card__reveal',
  '.codes-page__redeem-btn',
  '.codes-popup__close',
  '.codes-popup__link',
  '.pwa-install-button',
].join(', ');

function clearPressedState(element) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  element.classList.remove('is-pressed');
}

export function initPressFeedback(root = document) {
  if (!root || root.__pressFeedbackBound) {
    return;
  }

  root.__pressFeedbackBound = true;

  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') {
      return;
    }

    const target =
      event.target instanceof Element ? event.target.closest(PRESSABLE_SELECTOR) : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    target.classList.add('is-pressed');
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
    root.addEventListener(eventName, (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest(`${PRESSABLE_SELECTOR}, .is-pressed`)
          : null;
      clearPressedState(target);
    });
  });
}
