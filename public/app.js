const form = document.getElementById('search-form');
const usernameInput = document.getElementById('username');
const feedback = document.getElementById('feedback');
const resultContainer = document.getElementById('result');
const DEFAULT_FAVICON = 'https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf';

let setArtStore = {};
let setArtLoadPromise = null;
let setModalElements = null;
let lastFocusedElement = null;
let modalKeydownHandler = null;

function setFavicon(url) {
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
    link.href = href;
    link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    link.sizes = 'any';
  } catch (_) {
    // ignore
  }
}

function proxiedImageUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'wiki.vaulthunters.gg') {
      return `/img?url=${encodeURIComponent(url)}`;
    }
  } catch (e) {
    // ignore invalid URLs
  }
  return url;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();

  clearFeedback();

  if (!username) {
    showFeedback('Please enter a Minecraft username.', 'error');
    return;
  }

  setLoadingState(true);

  try {
    // Reserve space to reduce CLS during loading
    resultContainer.innerHTML = '<div class="skeleton skeleton--result" aria-hidden="true"></div>';
    resultContainer.classList.remove('hidden');
    setFavicon(DEFAULT_FAVICON);
    const response = await fetch(`/api/profile?username=${encodeURIComponent(username)}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Player not found. Double-check the spelling and try again.');
      }

      if (response.status === 400) {
        throw new Error('Invalid Minecraft username. Usernames are 3-16 characters without spaces.');
      }

      throw new Error('Something went wrong while retrieving the profile.');
    }

    const data = await response.json();
    await renderProfile(data);
    showFeedback(`Profile loaded for ${data.name}.`, 'success');
  } catch (error) {
    clearResult();
    showFeedback(error.message, 'error');
  } finally {
    setLoadingState(false);
  }
});

function setLoadingState(isLoading) {
  const button = form.querySelector('button');
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Searching...' : 'Search';
}

function clearFeedback() {
  feedback.textContent = '';
  feedback.classList.remove('error', 'success');
}

function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.classList.remove('error', 'success');

  if (type) {
    feedback.classList.add(type);
  }
}

function clearResult() {
  resultContainer.innerHTML = '';
  resultContainer.classList.add('hidden');
  updateQueryString('');
  closeSetDetailModal();
  setFavicon(DEFAULT_FAVICON);
}

async function renderProfile(data) {
  await loadSetArt();
  closeSetDetailModal();

  const sets = Array.isArray(data.sets) ? data.sets : [];
  const tiers = Array.isArray(data.tier) ? data.tier : [];
  const rewards = data.rewards && typeof data.rewards === 'object' ? data.rewards : {};

  const setsSection = renderSetsSection(sets);
  const tiersSection = renderTiersSection(tiers);
  const extraSection = renderExtraSection(rewards);
  const shareUrl = getShareUrl(data.name);

  resultContainer.innerHTML = `
    <article class="player-card">
      <img src="${data.head}" alt="${data.name}'s Minecraft head" loading="lazy" decoding="async" width="96" height="96" referrerpolicy="no-referrer">
      <div class="player-details">
        <h2>${data.name}</h2>
        <p class="player-subtitle">Latest Vault Hunters reward data.</p>
        <div class="player-actions">
          <button id="share-button" class="share-button" type="button" data-share="${shareUrl}">Copy Share Link</button>
          <span id="share-feedback" class="share-feedback" role="status" aria-live="polite"></span>
        </div>
      </div>
    </article>
    ${setsSection}
    ${tiersSection}
    ${extraSection}
  `;

  resultContainer.classList.remove('hidden');

  updateQueryString(data.name);
  bindShareButton();
  bindSetCardHandlers();
  // Update favicon to player's head
  setFavicon(data.head);

  bindDisclosureToggle('extra-toggle', 'extra-panel');
  bindDisclosureToggle('unlocks-toggle', 'unlocks-panel');
}

function bindShareButton() {
  const shareButton = document.getElementById('share-button');
  const shareFeedback = document.getElementById('share-feedback');

  if (!shareButton || !shareFeedback) {
    return;
  }

  shareFeedback.textContent = '';
  shareFeedback.classList.remove('success', 'error');

  shareButton.addEventListener('click', async () => {
    const link = shareButton.dataset.share;
    const success = await copyShareLink(link);
    updateShareFeedback(shareFeedback, success);
  });
}

function bindSetCardHandlers() {
  const cards = resultContainer.querySelectorAll('.set-card[data-set-key]');

  if (!cards.length) {
    return;
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => openSetDetailModal(card.dataset.setKey));
  });
}

function bindDisclosureToggle(toggleId, panelId) {
  const toggle = document.getElementById(toggleId);
  const panel = document.getElementById(panelId);
  if (!toggle || !panel) return;
  toggle.addEventListener('click', () => {
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isExpanded));
    panel.classList.toggle('hidden');
    const chev = toggle.querySelector('.chevron');
    if (chev) {
      chev.textContent = isExpanded ? '▾' : '▴';
    }
  });
}

function renderSetsSection(sets) {
  const note = `
    <div class="sets-help">
      <button id="unlocks-toggle" class="extra-toggle" type="button" aria-expanded="false" aria-controls="unlocks-panel">
        Not seeing all your unlocks? <span class="chevron" aria-hidden="true">▾</span>
      </button>
      <div id="unlocks-panel" class="rewards-panel hidden" role="region" aria-labelledby="unlocks-toggle">
        <p class='sets-note muted'>This list only shows sets you have already unlocked in-game. Upcoming or unreleased sets will appear here after they are added to the game.</p>
        <p class="muted">New rewards showing for other people but not for you? Make sure to connect your Minecraft and Twitch account with the Vault Hunters rewards service. In the Twitch extension go to the info tab and click the connect accounts button!</p>
      </div>
    </div>
  `;

  if (!sets.length) {
    return `
      <section>
        <h3 class='section-title'>Vault Sets</h3>
        <p class='muted'>No sets recorded yet.</p>
        ${note}
      </section>
    `;
  }

  const items = sets.map((setKey) => renderSetCard(setKey)).join('');

  return `
    <section>
      <h3 class='section-title'>Vault Sets</h3>
      <div class='sets-grid'>${items}</div>
      ${note}
    </section>
  `;
}

function renderSetCard(setKey) {
  const asset = setArtStore?.[setKey];
  const label = asset?.label || formatLabel(setKey);

  const proxied = asset?.image ? proxiedImageUrl(asset.image) : '';
  const imageMarkup = asset?.image
    ? `<img src="${proxied}" alt="${asset.alt || label}" loading="lazy" decoding="async" width="56" height="56" referrerpolicy="no-referrer" onerror="this.onerror=null;this.referrerPolicy='no-referrer';this.src='${asset?.image || ''}'">`
    : '';

  return `
    <button class="set-card" type="button" data-set-key="${setKey}">
      ${imageMarkup}
      <span>${label}</span>
    </button>
  `;
}

function renderTiersSection(tiers) {
  const title = 'Patreon Sets Unlocked';

  if (!tiers.length) {
    return `
      <section>
        <h3 class="section-title">${title}</h3>
        <p class="muted">No Patreon tiers unlocked yet.</p>
      </section>
    `;
  }

  const items = tiers
    .map((tier) => {
      const label = tier && typeof tier === 'object'
        ? tier.name || formatLabel(tier.id)
        : formatLabel(tier);
      return `<li>${label}</li>`;
    })
    .join('');

  return `
    <section>
      <h3 class="section-title">${title}</h3>
      <ul class="tiers-list">${items}</ul>
    </section>
  `;
}

function renderExtraSection(rewards) {
  const hasRewards = Object.keys(rewards).length > 0;
  const panelContent = hasRewards ? renderRewardsList(rewards) : '<p class="muted">No individual rewards recorded.</p>';

  return `
    <section>
      <button id="extra-toggle" class="extra-toggle" type="button" aria-expanded="false">Extra Info</button>
      <div id="extra-panel" class="rewards-panel hidden">${panelContent}</div>
    </section>
  `;
}

function renderRewardsList(rewards) {
  return Object.entries(rewards)
    .map(([group, items]) => {
      const normalizedItems = Array.isArray(items) ? items : [];
      const listItems = normalizedItems
        .map((item) => `<li>${formatLabel(item)}</li>`)
        .join('');

      return `
        <div class="reward-group">
          <h3>${formatLabel(group)}</h3>
          <ul>${listItems}</ul>
        </div>
      `;
    })
    .join('');
}

async function loadSetArt() {
  if (Object.keys(setArtStore).length) {
    return setArtStore;
  }

  if (setArtLoadPromise) {
    return setArtLoadPromise;
  }

  setArtLoadPromise = fetch('set-art.json')
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
      console.error(error);
      setArtStore = {};
      return setArtStore;
    });

  return setArtLoadPromise;
}

function ensureSetDetailModal() {
  if (setModalElements) {
    return setModalElements;
  }

  const overlay = document.createElement('div');
  overlay.id = 'set-modal';
  overlay.className = 'set-modal hidden';
  overlay.innerHTML = `
    <div class="set-modal__backdrop" data-close="true"></div>
    <div class="set-modal__content" role="dialog" aria-modal="true" aria-labelledby="set-modal-title" tabindex="-1">
      <button type="button" class="set-modal__close" aria-label="Close set details">
        <span aria-hidden="true">&times;</span>
      </button>
      <div class="set-modal__body">
        <img class="set-modal__image set-modal__image--hidden" alt="" decoding="async" width="96" height="96">
        <h3 id="set-modal-title" class="set-modal__title"></h3>
        <p class="set-modal__description"></p>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const elements = {
    overlay,
    backdrop: overlay.querySelector('.set-modal__backdrop'),
    content: overlay.querySelector('.set-modal__content'),
    close: overlay.querySelector('.set-modal__close'),
    image: overlay.querySelector('.set-modal__image'),
    title: overlay.querySelector('.set-modal__title'),
    description: overlay.querySelector('.set-modal__description')
  };

  elements.backdrop.addEventListener('click', closeSetDetailModal);
  elements.close.addEventListener('click', closeSetDetailModal);

  setModalElements = elements;
  return elements;
}

function openSetDetailModal(setKey) {
  const modal = ensureSetDetailModal();
  const asset = setArtStore?.[setKey] || {};
  const label = asset.label || formatLabel(setKey);
  const description = asset.description || `You obtained this by unlocking the ${label}.`;

  if (asset.image) {
    const proxied = proxiedImageUrl(asset.image);
    modal.image.src = proxied;
    modal.image.alt = asset.alt || label;
    modal.image.setAttribute('referrerpolicy', 'no-referrer');
    modal.image.onerror = () => {
      modal.image.onerror = null;
      modal.image.src = asset.image;
      modal.image.setAttribute('referrerpolicy', 'no-referrer');
    };
    modal.image.classList.remove('set-modal__image--hidden');
  } else {
    modal.image.src = '';
    modal.image.alt = '';
    modal.image.classList.add('set-modal__image--hidden');
  }

  modal.title.textContent = label;
  modal.description.textContent = description;

  modal.overlay.classList.remove('hidden');

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.content.focus();

  if (modalKeydownHandler) {
    window.removeEventListener('keydown', modalKeydownHandler);
  }

  modalKeydownHandler = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSetDetailModal();
    }
  };

  window.addEventListener('keydown', modalKeydownHandler);
}

function closeSetDetailModal() {
  if (!setModalElements || setModalElements.overlay.classList.contains('hidden')) {
    return;
  }

  setModalElements.overlay.classList.add('hidden');

  if (modalKeydownHandler) {
    window.removeEventListener('keydown', modalKeydownHandler);
    modalKeydownHandler = null;
  }

  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
}

function getUsernameFromQuery() {
  const { search } = window.location;

  if (!search || search.length <= 1) {
    return '';
  }

  const rawQuery = search.slice(1);
  if (!rawQuery) {
    return '';
  }

  const params = new URLSearchParams(rawQuery);
  const candidate =
    params.get('username') ||
    params.get('user') ||
    params.get('name');

  const decode = (value) => {
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch (error) {
      return value;
    }
  };

  if (candidate) {
    return decode(candidate).trim();
  }

  const firstSegment = rawQuery.split('&')[0] || '';

  if (!firstSegment) {
    return '';
  }

  if (firstSegment.includes('=')) {
    const [, value = ''] = firstSegment.split('=');
    return decode(value).trim();
  }

  return decode(firstSegment).trim();
}

function getShareUrl(username) {
  const cleaned = (username || '').trim();

  if (!cleaned) {
    return `${window.location.origin}${window.location.pathname}`;
  }

  return `${window.location.origin}${window.location.pathname}?${encodeURIComponent(cleaned)}`;
}

function updateQueryString(username) {
  const cleaned = (username || '').trim();
  const next = cleaned ? `?${encodeURIComponent(cleaned)}` : '';

  if (window.location.search === next) {
    return;
  }

  history.replaceState(null, '', `${window.location.pathname}${next}`);
}

async function copyShareLink(link) {
  if (!link) {
    return false;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      return true;
    }
  } catch (error) {
    // Ignore and fall back below
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = link;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    const result = document.execCommand('copy');
    document.body.removeChild(textArea);
    return result;
  } catch (error) {
    return false;
  }
}

function updateShareFeedback(target, success) {
  if (!target) {
    return;
  }

  target.classList.remove('success', 'error');

  if (success) {
    target.textContent = 'Share link copied!';
    target.classList.add('success');
  } else {
    target.textContent = 'Copy failed. You can copy the link manually.';
    target.classList.add('error');
  }
}

function formatLabel(value) {
  if (!value && value !== 0) {
    return '';
  }

  const cleaned = String(value)
    .replace(/^[^:]*:/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\//g, ' / ')
    .trim();

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const presetUsername = getUsernameFromQuery();
if (presetUsername) {
  usernameInput.value = presetUsername;
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

