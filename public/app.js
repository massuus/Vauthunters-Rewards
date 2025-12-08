import { isCodesQuery, isAllQuery, renderCodesPage, renderAllRewardsPage } from './special-pages.js';
import { loadTemplate, renderTemplate, preloadTemplates } from './template-loader.js';

const form = document.getElementById('search-form');
const usernameInput = document.getElementById('username');
const feedback = document.getElementById('feedback');
const resultContainer = document.getElementById('result');
const recentContainer = document.getElementById('recent');
const DEFAULT_FAVICON = 'https://mc-heads.net/avatar/f00538241a8649c4a5199ba93a40ddcf/64';
const UNKNOWN_ITEM_IMAGE = '/img/unknown_item.png';
const defaultTitle = document.title;
const metaDescriptionEl = document.querySelector('meta[name="description"]');
const defaultDescription = metaDescriptionEl ? (metaDescriptionEl.getAttribute('content') || '') : '';

function setMetaDescription(text) {
  try {
    if (!metaDescriptionEl) return;
    metaDescriptionEl.setAttribute('content', text || '');
  } catch (_) {}
}

let setArtStore = {};
let setArtLoadPromise = null;
let setModalElements = null;
let lastFocusedElement = null;
let modalKeydownHandler = null;
let templateCache = {};

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
    // Route through our proxy for consistent caching and SW control
    link.href = proxiedImageUrl(href);
    link.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    link.sizes = 'any';
  } catch (_) {
    // ignore
  }
}

function proxiedImageUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'wiki.vaulthunters.gg' || u.hostname === 'mc-heads.net') {
      return `/img?url=${encodeURIComponent(url)}`;
    }
  } catch (e) {
    // ignore invalid URLs
  }
  return url;
}

let submitTimer = null;
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (submitTimer) clearTimeout(submitTimer);
  submitTimer = setTimeout(() => { submitSearch().catch(() => {}); }, 250);
});

async function submitSearch() {
  const username = usernameInput.value.trim();

  clearFeedback();

  if (!username) {
    showFeedback('Please enter a Minecraft username.', 'error');
    return;
  }

  if (isCodesQuery(username)) {
    setLoadingState(true);
    try {
      await renderCodesPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        closeSetDetailModal,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        DEFAULT_FAVICON
      );
    } catch (error) {
      showFeedback('Unable to load the reward codes right now. Please try again in a moment.', 'error');
    } finally {
      setLoadingState(false);
    }
    return;
  }

  if (isAllQuery(username)) {
    setLoadingState(true);
    try {
      await renderAllRewardsPage(
        resultContainer,
        setFavicon,
        setMetaDescription,
        closeSetDetailModal,
        updateQueryString,
        proxiedImageUrl,
        escapeHtml,
        formatLabel,
        DEFAULT_FAVICON
      );
    } catch (error) {
      showFeedback('Unable to load all rewards right now. Please try again in a moment.', 'error');
    } finally {
      setLoadingState(false);
    }
    return;
  }

  setLoadingState(true);

  try {
    // Reserve space to reduce CLS during loading
    resultContainer.innerHTML = await loadTemplate('loading-skeleton');
    resultContainer.classList.remove('hidden');
    setFavicon(DEFAULT_FAVICON);
    document.title = defaultTitle;
    const response = await fetch(buildProfileApiUrl(username));

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
  } catch (error) {
    clearResult();
    showFeedback(error.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(isLoading) {
  const button = form.querySelector('button');
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Searching...' : 'Search';
}

function clearFeedback() {
  feedback.textContent = '';
  feedback.classList.remove('error', 'success');
  try { feedback.setAttribute('hidden', ''); } catch (_) {}
}

function showFeedback(message, type) {
  feedback.textContent = message;
  feedback.classList.remove('error', 'success');

  if (type) {
    feedback.classList.add(type);
  }
  const hasText = !!(message && String(message).trim());
  try {
    if (hasText) {
      feedback.removeAttribute('hidden');
    } else {
      feedback.setAttribute('hidden', '');
    }
  } catch (_) {}
}

function clearResult() {
  resultContainer.innerHTML = '';
  resultContainer.classList.add('hidden');
  updateQueryString('');
  closeSetDetailModal();
  setFavicon(DEFAULT_FAVICON);
  document.title = defaultTitle;
  setMetaDescription(defaultDescription);
}

async function renderProfile(data) {
  await loadSetArt();
  closeSetDetailModal();

  const originalSets = Array.isArray(data.sets) ? data.sets : [];
  const sets = augmentSets(originalSets);
  const tiers = Array.isArray(data.tier) ? data.tier : [];
  const rewards = data.rewards && typeof data.rewards === 'object' ? data.rewards : {};
  const usernameKey = (data && data.name ? String(data.name) : '').trim().toLowerCase();
  const previouslySeen = getSeenSets(usernameKey);
  const newSetKeys = previouslySeen && previouslySeen.size
    ? new Set(sets.filter((k) => !previouslySeen.has(k)))
    : new Set();

  const setsSection = renderSetsSection(sets, newSetKeys);
  const tiersSection = renderTiersSection(tiers);
  const extraSection = renderExtraSection(rewards);
  const shareUrl = getShareUrl(data.name);

  const playerCard = await loadTemplate('player-card');
  resultContainer.innerHTML = renderTemplate(playerCard, {
    head: proxiedImageUrl(data.head),
    name: data.name,
    shareUrl: shareUrl
  }) + setsSection + tiersSection + extraSection;

  resultContainer.classList.remove('hidden');

  updateQueryString(data.name);
  bindShareButton();
  bindSetCardHandlers();
  // Update favicon to player's head
  setFavicon(data.head);
  // Update document title to include player name
  if (data && data.name) {
    document.title = `${data.name} - Vault Hunters Rewards`;
    setMetaDescription(`Vault Hunters rewards for ${data.name}: sets, tiers, and more.`);
  }

  bindDisclosureToggle('extra-toggle', 'extra-panel');
  bindDisclosureToggle('unlocks-toggle', 'unlocks-panel');

  // Persist the current sets so future lookups can detect new ones
  setSeenSets(usernameKey, new Set(sets));

  // Update recent list
  addRecentUser({ name: data.name, head: data.head });
  renderRecentSection();
}

function buildProfileApiUrl(username) {
  const base = new URL('/api/profile', window.location.origin);
  base.searchParams.set('username', username);
  // Pass through a small allowlist of debug params from the page URL
  try {
    const current = new URL(window.location.href);
    ['mock', 'bust'].forEach((k) => {
      if (current.searchParams.has(k)) {
        base.searchParams.set(k, current.searchParams.get(k) || '1');
      }
    });
  } catch {}
  return base.pathname + '?' + base.searchParams.toString();
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
  const chev = toggle.querySelector('.chevron');

  const setChevronForState = (expanded) => {
    if (!chev) return;
    // Show ▲ when collapsed, ▼ when expanded
    chev.textContent = expanded ? '▼' : '▲';
  };

  // Ensure initial chevron matches current state
  const initialExpanded = toggle.getAttribute('aria-expanded') === 'true';
  setChevronForState(initialExpanded);

  toggle.addEventListener('click', () => {
    const wasExpanded = toggle.getAttribute('aria-expanded') === 'true';
    const nextExpanded = !wasExpanded;
    toggle.setAttribute('aria-expanded', String(nextExpanded));
    panel.classList.toggle('hidden');
    setChevronForState(nextExpanded);
  });
}

function renderSetsSection(sets, newSetKeys = new Set()) {
  const note = templateCache['sets-help'] || '';
  const hasSets = sets.length > 0;
  const setsContent = hasSets ? sets.map((setKey) => renderSetCard(setKey, newSetKeys.has(setKey))).join('') : '';
  
  return `
    <section>
      <h3 class='section-title'>Vault Sets</h3>
      ${hasSets ? `<div class='sets-grid'>${setsContent}</div>` : `<p class='muted'>No sets recorded yet.</p>`}
      <p class='rewards-cta'>
        <a class="rewards-cta__link" href="?all" rel="noopener">
          <span class="rewards-cta__icon" aria-hidden="true">🎁</span>
          <span>Browse all rewards</span>
          <span class="rewards-cta__arrow" aria-hidden="true">→</span>
        </a>
      </p>
      ${note}
    </section>
  `;
}

function renderSetCard(setKey, isNew = false) {
  const asset = setArtStore?.[setKey];
  const label = asset?.label || formatLabel(setKey);

  const isFallbackImage = !asset?.image;
  const imageSource = asset?.image || UNKNOWN_ITEM_IMAGE;
  const proxied = proxiedImageUrl(imageSource);
  const altText = asset?.alt || label;
  const fallbackClass = isFallbackImage ? ' class="pixelated-image"' : '';
  const imageMarkup = `<img${fallbackClass} src="${proxied}" alt="${altText}" loading="lazy" decoding="async" fetchpriority="low" width="56" height="56" referrerpolicy="no-referrer" onerror="this.onerror=null;this.referrerPolicy='no-referrer';this.src='${imageSource}'">`;

  const newBadge = isNew ? `<span class=\"set-card__badge\" aria-label=\"New unlock\">New</span>` : '';
  const extraClass = isNew ? ' set-card--new' : '';

  return `
    <button class="set-card${extraClass}" type="button" data-set-key="${setKey}">
      ${imageMarkup}
      <span>${label}</span>
      ${newBadge}
    </button>
  `;
}

function renderTiersSection(tiers) {
  const title = 'Patreon Tiers Unlocked';
  const hasTiers = tiers.length > 0;

  const items = hasTiers ? tiers
    .map((tier) => {
      const label = tier && typeof tier === 'object'
        ? tier.name || formatLabel(tier.id)
        : formatLabel(tier);
      return `<li>${label}</li>`;
    })
    .join('') : '';

  return `
    <section>
      <h3 class="section-title">${title}</h3>
      ${hasTiers ? `<ul class="tiers-list">${items}</ul>` : `<p class="muted">No Patreon tiers unlocked yet.</p>`}
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

      const rows = normalizedItems
        .map((item) => {
          const path = deriveRewardPath(String(group), String(item));
          const name = deriveRewardName(path, String(group), String(item));
          const safeName = name ? escapeHtml(name) : '';
          const safePath = path ? escapeHtml(path) : '';
          return `<tr><td>${safeName}</td><td><code>${safePath}</code></td></tr>`;
        })
        .join('');

      return `
        <div class="reward-group">
          <h3>${formatLabel(group)}</h3>
          <table class="rewards-table">
            <thead>
              <tr><th>Name</th><th>Path</th></tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    })
    .join('');
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toSnake(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\/]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function deriveRewardPath(group, item) {
  const raw = String(item).trim();
  if (!raw) return '';

  // Already a fully qualified namespaced id
  if (raw.includes(':')) return raw;

  // Looks like a registry path missing namespace
  if (/^[a-z0-9_]+\//i.test(raw)) return `the_vault:${raw}`;

  const g = String(group).toLowerCase();
  const pieceMap = {
    helmet: 'helmet',
    chestplate: 'chestplate',
    leggings: 'leggings',
    boots: 'boots'
  };

  // Armor pieces: use set name + piece
  if (g in pieceMap) {
    const setId = toSnake(raw);
    const piece = pieceMap[g];
    if (setId) return `the_vault:gear/armor/${setId}/${piece}`;
  }

  // Gear single item types
  const gearTypes = new Set(['shield', 'axe', 'wand', 'focus', 'sword', 'magnet', 'magnets']);
  if (gearTypes.has(g)) {
    const type = g === 'magnets' ? 'magnets' : g; // keep plural if present in data
    const nameId = toSnake(raw);
    if (nameId) return `the_vault:gear/${type}/${nameId}`;
  }

  // Unknown mapping: leave blank to avoid guessing wrong
  return '';
}

function deriveRewardName(path, group, originalItem) {
  // If we have a parseable path, derive a clean name
  if (path && path.includes(':')) {
    const afterNs = path.split(':', 2)[1] || path;
    const parts = afterNs.split('/').filter(Boolean);
    // gear/armor/<set>/<piece>
    if (parts[0] === 'gear' && parts[1] === 'armor' && parts.length >= 3) {
      return formatLabel(parts[2]);
    }
    // gear/<type>/<name>
    if (parts[0] === 'gear' && parts.length >= 3) {
      return formatLabel(parts[2]);
    }
  }

  // Fallback: show formatted original item text
  return formatLabel(originalItem || '');
}

function augmentSets(sets) {
  try {
    const list = Array.isArray(sets) ? sets.slice() : [];
    const helmet = 'iskall85_falcon_helmet';
    const chest = 'iskall85_falcon_chestplate';
    const combined = 'iskall85_falcon_set';

    const hasHelmet = list.includes(helmet);
    const hasChest = list.includes(chest);

    if (hasHelmet && hasChest) {
      const filtered = list.filter((k) => k !== helmet && k !== chest);
      if (!filtered.includes(combined)) filtered.push(combined);
      return Array.from(new Set(filtered));
    }

    // Only one or none present: keep as-is
    return Array.from(new Set(list));
  } catch (_) {
    return Array.isArray(sets) ? sets : [];
  }
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

function openSetDetailModal(setKey) {
  const modal = ensureSetDetailModal();
  const asset = setArtStore?.[setKey] || {};
  const label = asset.label || formatLabel(setKey);
  const description = asset.description || `You obtained this by unlocking the ${label}.`;

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

function getSeenSets(username) {
  try {
    if (!username) return new Set();
    const raw = localStorage.getItem(`vh.seenSets.${username}`);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.filter((v) => typeof v === 'string'));
  } catch (_) {
    return new Set();
  }
}

function setSeenSets(username, setKeys) {
  try {
    if (!username) return;
    const arr = Array.from(setKeys || []);
    localStorage.setItem(`vh.seenSets.${username}`, JSON.stringify(arr));
  } catch (_) {
    // ignore storage errors (quota, privacy mode, etc.)
  }
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

// Initialize templates and app
async function initializeApp() {
  // Preload commonly used templates
  try {
    const templates = ['player-card', 'sets-help', 'recent-section', 'loading-skeleton', 'set-modal'];
    await preloadTemplates(templates);
    // Store sets-help in cache for sync access
    templateCache['sets-help'] = await loadTemplate('sets-help');
  } catch (error) {
    console.error('Error preloading templates:', error);
  }

  // Check for preset username from URL
  const presetUsername = getUsernameFromQuery();
  if (presetUsername) {
    usernameInput.value = presetUsername;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }
  
  // Render recents on first load as well
  await renderRecentSection();
}

// Register Service Worker for offline caching (images cache-first)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// Initialize the app
initializeApp();

function getRecentUsers() {
  try {
    const raw = localStorage.getItem('vh.recentUsers');
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // sanitize
    return list
      .map((x) => ({ name: String(x?.name || '').trim(), head: String(x?.head || '') }))
      .filter((x) => x.name);
  } catch (_) {
    return [];
  }
}

function saveRecentUsers(list) {
  try {
    localStorage.setItem('vh.recentUsers', JSON.stringify(list || []));
  } catch (_) {}
}

function addRecentUser(user) {
  try {
    const name = String(user?.name || '').trim();
    const head = String(user?.head || '');
    if (!name) return;
    const key = name.toLowerCase();
    const existing = getRecentUsers().filter((u) => u.name.toLowerCase() !== key);
    const next = [{ name, head }, ...existing].slice(0, 4);
    saveRecentUsers(next);
  } catch (_) {}
}

async function renderRecentSection() {
  if (!recentContainer) return;
  const items = getRecentUsers();
  if (!items.length) {
    recentContainer.classList.add('hidden');
    recentContainer.innerHTML = '';
    return;
  }
  const buttons = items
    .map((u) => {
      const img = proxiedImageUrl(u.head || DEFAULT_FAVICON);
      const safe = escapeHtml(u.name);
      return `<button class="recent-item" type="button" data-name="${safe}"><img src="${img}" alt="${safe}'s head" width="28" height="28"><span>${safe}</span></button>`;
    })
    .join('');
  
  const template = await loadTemplate('recent-section');
  recentContainer.innerHTML = renderTemplate(template, { buttons });
  recentContainer.classList.remove('hidden');
  bindRecentHandlers();
}

function bindRecentHandlers() {
  if (!recentContainer) return;
  recentContainer.querySelectorAll('button.recent-item[data-name]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-name') || '';
        if (!name) return;
        usernameInput.value = name;
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
    });
}

