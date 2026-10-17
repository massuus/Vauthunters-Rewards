import { getRewardOrder, saveRewardOrder } from '../utils/storage-manager.js';
import { compareRewardCategories } from '../features/reward-categories.js';
import { getSetArtStore } from './set-art-manager.js';
import { resultContainer, usernameInput, form } from '../utils/dom-utils.js';
import { copyShareLink } from '../utils/clipboard-utils.js';
import { updateShareFeedback } from '../features/ui-feedback.js';
import { syncActiveNavigation } from './navigation.js';

let setCardCycleTimers = [];

export function bindServerLinkHandlers(root = resultContainer) {
  root.querySelectorAll('[data-server-query]').forEach((button) => {
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

      const metric = button.getAttribute('data-leaderboard-metric') || '';
      const streamer = button.getAttribute('data-leaderboard-streamer') || '';
      if (['seasonLevel', 'vaultsJoined'].includes(metric) && /^[a-z0-9_]{1,25}$/i.test(streamer)) {
        const params = new URLSearchParams({
          leaderboard: playerName,
          metric,
          streamer: streamer.toLowerCase(),
        });
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
        syncActiveNavigation();
      }

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

    card.addEventListener('keydown', (event) => {
      if (event.target.closest('a')) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.click();
      }
    });

    card.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        return;
      }

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

export function bindRewardSort() {
  const select = resultContainer.querySelector('[data-reward-sort]');
  const grids = [
    ...resultContainer.querySelectorAll('#profile-unlocked-rewards, [data-sortable-rewards]'),
  ];
  if (!select || !grids.length) return;
  // Preserve the API's original unlock order and the cards' existing handlers.
  const originals = grids.map((grid) => ({ grid, cards: [...grid.children] }));
  const art = getSetArtStore();
  const applyOrder = () => {
    for (const { grid, cards } of originals) {
      if (select.value !== 'category') {
        grid.replaceChildren(...cards);
        continue;
      }
      const groups = new Map();
      for (const card of cards) {
        const category = art[card.dataset.setKey]?.category || 'Other rewards';
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(card);
      }
      const fragment = document.createDocumentFragment();
      const categories = [...groups.keys()].sort(compareRewardCategories);
      for (const category of categories) {
        const heading = document.createElement('h4');
        heading.className = 'profile-reward-category';
        heading.textContent = `${category} (${groups.get(category).length})`;
        fragment.append(heading, ...groups.get(category));
      }
      grid.replaceChildren(fragment);
    }
  };
  select.value = getRewardOrder();
  applyOrder();
  select.addEventListener('change', () => {
    saveRewardOrder(select.value);
    applyOrder();
  });
}
