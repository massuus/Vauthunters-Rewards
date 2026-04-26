import { resultContainer, usernameInput, form } from '../utils/dom-utils.js';
import { copyShareLink } from '../utils/clipboard-utils.js';
import { updateShareFeedback } from '../features/ui-feedback.js';

let setCardCycleTimers = [];

export function bindServerLinkHandlers() {
  resultContainer.querySelectorAll('[data-server-query]').forEach((button) => {
    button.addEventListener('click', () => {
      const serverQuery = button.getAttribute('data-server-query') || '';
      if (!serverQuery) return;
      usernameInput.value = serverQuery;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });
}

export function bindLeaderboardLevelHandlers() {
  resultContainer.querySelectorAll('[data-leaderboard-player]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerName = button.getAttribute('data-leaderboard-player') || '';
      if (!playerName) return;
      usernameInput.value = `leaderboard:${playerName}`;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });
}

export function bindShareButton() {
  const shareButton = document.getElementById('share-button');
  const shareFeedback = document.getElementById('share-feedback');

  if (!shareButton || !shareFeedback) {
    return;
  }

  shareFeedback.textContent = '';
  shareFeedback.classList.remove('success', 'error');

  shareButton.addEventListener('click', async () => {
    const link = shareButton.dataset.share;
    await copyShareLink(link, shareFeedback, updateShareFeedback);
  });
}

export function bindSetCardHandlers() {
  const cards = resultContainer.querySelectorAll('.set-card[data-set-key]');
  const isTouchDevice =
    window.matchMedia('(hover: none), (pointer: coarse)').matches || navigator.maxTouchPoints > 0;

  resultContainer.classList.toggle('touch-input', isTouchDevice);

  setCardCycleTimers.forEach((timerId) => window.clearInterval(timerId));
  setCardCycleTimers = [];

  if (!cards.length) {
    return;
  }

  cards.forEach((card) => {
    card.setAttribute('aria-expanded', 'false');

    const setPeekState = (peek) => card.classList.toggle('set-card--peek', peek);

    card.addEventListener('pointerdown', () => setPeekState(true));
    card.addEventListener('pointerup', () => setPeekState(false));
    card.addEventListener('pointerleave', () => setPeekState(false));
    card.addEventListener('pointercancel', () => setPeekState(false));
    card.addEventListener('blur', () => setPeekState(false));

    card.addEventListener('click', () => {
      const isExpanded = card.getAttribute('aria-expanded') === 'true';
      const nextExpanded = !isExpanded;
      card.setAttribute('aria-expanded', String(nextExpanded));
      card.classList.toggle('set-card--expanded', nextExpanded);

      if (isTouchDevice) {
        card.classList.remove('set-card--peek');
        card.blur();
      }
    });

    const mediaImages = card.querySelectorAll('.set-card__media-img');
    if (mediaImages.length > 1) {
      let currentIndex = 0;
      const timerId = window.setInterval(() => {
        mediaImages[currentIndex].classList.remove('is-active');
        currentIndex = (currentIndex + 1) % mediaImages.length;
        mediaImages[currentIndex].classList.add('is-active');
      }, 5000);
      setCardCycleTimers.push(timerId);
    }
  });
}

export function bindCtaButtonHandlers() {
  const buttons = resultContainer.querySelectorAll('button[data-search]');

  if (!buttons.length) {
    return;
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const query = btn.dataset.search;
      if (!query) return;
      usernameInput.value = query;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });
}

export function bindDisclosureToggle(toggleId, panelId) {
  const toggle = document.getElementById(toggleId);
  const panel = document.getElementById(panelId);
  if (!toggle || !panel) return;
  const chev =
    toggle.querySelector('.chevron') || toggle.querySelector('.missing-rewards__toggle-icon');

  const setChevronForState = (expanded) => {
    if (!chev) return;
    // Show ▲ when collapsed, ▼ when expanded
    chev.textContent = expanded ? '▼' : '▲';
  };

  const initialExpanded = toggle.getAttribute('aria-expanded') === 'true';
  setChevronForState(initialExpanded);

  toggle.addEventListener('click', () => {
    const wasExpanded = toggle.getAttribute('aria-expanded') === 'true';
    const nextExpanded = !wasExpanded;
    toggle.setAttribute('aria-expanded', String(nextExpanded));

    if (panel.hasAttribute('hidden') || nextExpanded === false) {
      if (nextExpanded) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    }
    if (panel.classList.contains('hidden') || (!panel.hasAttribute('hidden') && !nextExpanded)) {
      panel.classList.toggle('hidden');
    }

    setChevronForState(nextExpanded);
  });
}
