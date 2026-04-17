// Profile rendering and display functions

import { logger } from '../core/logger.js';
import { loadTemplate, renderTemplate } from '../loaders/template-loader.js';
import {
  resultContainer,
  proxiedImageUrl,
  setMetaDescription,
  setFavicon,
  UNKNOWN_ITEM_IMAGE,
  usernameInput,
  form,
} from '../utils/dom-utils.js';
import {
  escapeHtml,
  deriveRewardName,
  augmentSets,
  formatLabel,
} from '../features/reward-utils.js';
import { loadSetArt, getSetArtStore, closeSetDetailModal } from './set-art-manager.js';
import { getShareUrl } from '../features/url-state.js';
import { getSeenSets, setSeenSets, addRecentUser } from '../utils/storage-manager.js';
import { copyShareLink } from '../utils/clipboard-utils.js';
import { updateShareFeedback } from '../features/ui-feedback.js';
import { getBestPatreonTier } from '../utils/tier-utils.js';
import { fetchOfficialServers, findServerByPlayerName } from '../features/official-servers.js';

let setsHelpTemplate = '';
let setCardCycleTimers = [];

const ISKALL85_TIER_CONFIG = {
  iron: { rank: 1, color: '#a7a7a7', badge: '/img/badge/iron.webp' },
  gold: { rank: 2, color: '#f3dc00', badge: '/img/badge/gold.webp' },
  diamond: { rank: 3, color: '#59d6ff', badge: '/img/badge/diamond.webp' },
  'iskallium diamond': { rank: 4, color: '#8fffd7', badge: '/img/badge/iskallium-diamond.webp' },
  emerald: { rank: 5, color: '#4cff7c', badge: '/img/badge/emerald.webp' },
};

function getBestTierFromConfig(tiers, tierConfig) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return null;
  }

  let bestTier = null;
  let bestRank = 0;

  tiers.forEach((tier) => {
    const tierName = typeof tier === 'object' && tier.name ? tier.name : String(tier);
    const tierKey = tierName.toLowerCase();
    const config = tierConfig?.[tierKey];

    if (config && config.rank > bestRank) {
      bestRank = config.rank;
      bestTier = {
        name: tierName,
        ...config,
      };
    }
  });

  return bestTier;
}

/**
 * Render a player profile with their sets, tiers, and rewards
 */
export async function renderProfile(data) {
  // Import renderRecentSection here to avoid circular dependency
  const { renderRecentSection } = await import('./recent-section.js');

  await loadSetArt();
  closeSetDetailModal();

  // Load sets-help template if not already cached
  if (!setsHelpTemplate) {
    try {
      setsHelpTemplate = await loadTemplate('sets-help');
    } catch (err) {
      logger.error('Error loading sets-help template', { error: err.message, stack: err.stack });
      setsHelpTemplate = '';
    }
  }

  const setArtStore = getSetArtStore();
  const originalSets = Array.isArray(data.sets) ? data.sets : [];
  const sets = augmentSets(originalSets);
  const tiers = Array.isArray(data.tier) ? data.tier : [];
  const iskall85Tiers = Array.isArray(data.iskall85Tier) ? data.iskall85Tier : [];
  const rewards = data.rewards && typeof data.rewards === 'object' ? data.rewards : {};
  const usernameKey = (data && data.name ? String(data.name) : '').trim().toLowerCase();
  const previouslySeen = getSeenSets(usernameKey);

  // Only show "New" badges if the player was already in the cache (previouslySeen has items)
  const isReturningPlayer = previouslySeen.size > 0;
  const newSetKeys = isReturningPlayer
    ? new Set(sets.filter((s) => !previouslySeen.has(s)))
    : new Set();

  const setsSection = renderSetsSection(sets, newSetKeys);
  const missingRewardsSection = renderMissingRewardsSection(sets, setArtStore);
  const tiersSection = renderTiersSection(tiers, iskall85Tiers);
  const extraSection = renderExtraSection(rewards);
  const shareUrl = getShareUrl(data.name);

  // Show up to one badge per Patreon group beside the username
  const bestVaultHuntersTier = getBestPatreonTier(tiers);
  const bestIskall85Tier = getBestTierFromConfig(iskall85Tiers, ISKALL85_TIER_CONFIG);
  const nameStyle = bestVaultHuntersTier
    ? `color: ${bestVaultHuntersTier.color}; font-weight: 600;`
    : '';
  const tierBadge = [bestVaultHuntersTier, bestIskall85Tier]
    .filter(Boolean)
    .map(
      (tier) =>
        `<img class="tier-badge pixelated-image" src="${tier.badge}" alt="${tier.name} badge" title="${tier.name}" width="24" height="24">`
    )
    .join('');

  let serverLink = '';
  try {
    const servers = await fetchOfficialServers();
    const matchedServer = findServerByPlayerName(data.name, servers);
    if (matchedServer?._id && matchedServer?.name) {
      const serverQuery = escapeHtml(matchedServer.name);
      const serverName = escapeHtml(matchedServer.name);
      serverLink = `<button class="player-server-link" type="button" data-server-query="${serverQuery}" title="View ${serverName} players">${serverName}</button>`;
    }
  } catch {
    // Non-blocking: profile rendering should continue even if server lookup fails.
  }

  const playerCard = await loadTemplate('player-card');
  resultContainer.innerHTML =
    renderTemplate(playerCard, {
      head: proxiedImageUrl(data.head),
      name: data.name,
      shareUrl: shareUrl,
      nameStyle: nameStyle,
      tierBadge: tierBadge,
      serverLink: serverLink,
    }) +
    setsSection +
    missingRewardsSection +
    tiersSection +
    extraSection;

  resultContainer.classList.remove('hidden');

  // Update query string manually
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}?user=${encodeURIComponent(data.name)}`
  );

  bindShareButton();
  bindServerLinkHandlers();
  bindSetCardHandlers();
  bindCtaButtonHandlers();
  // Update favicon to player's head
  setFavicon(data.head);
  // Update document title to include player name
  if (data && data.name) {
    document.title = `${data.name} - Vault Hunters Rewards`;
    setMetaDescription(`Vault Hunters rewards for ${data.name}: sets, tiers, and more.`);
  }

  bindDisclosureToggle('extra-toggle', 'extra-panel');
  bindDisclosureToggle('unlocks-toggle', 'unlocks-panel');
  bindDisclosureToggle('missing-obtainable-toggle', 'missing-obtainable-panel');
  bindDisclosureToggle('missing-legacy-toggle', 'missing-legacy-panel');

  // Persist the current sets so future lookups can detect new ones (per-player)
  setSeenSets(usernameKey, new Set(sets));

  // Update recent list with both name and head
  addRecentUser({ name: data.name, head: data.head, tier: tiers });
  await renderRecentSection();
}

function bindServerLinkHandlers() {
  resultContainer.querySelectorAll('[data-server-query]').forEach((button) => {
    button.addEventListener('click', () => {
      const serverQuery = button.getAttribute('data-server-query') || '';
      if (!serverQuery) return;
      usernameInput.value = serverQuery;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  });
}

/**
 * Render the vault sets section
 */
function renderSetsSection(sets, newSetKeys = new Set()) {
  const hasSets = sets.length > 0;
  const setsContent = hasSets
    ? sets.map((setKey) => renderSetCard(setKey, newSetKeys.has(setKey))).join('')
    : '';

  return `
    <section>
      <div class="section-title-container">
        <h3 class='section-title'>Vault Sets</h3>
      </div>
      ${setsHelpTemplate}
      ${hasSets ? `<div class='sets-grid'>${setsContent}</div>` : `<p class='muted'>No sets recorded yet.</p>`}
      <div class='rewards-cta-container' style="display: none;">
        <p class='rewards-cta'>
          <button class="rewards-cta__link" data-search="all" type="button">
            <span class="rewards-cta__icon" aria-hidden="true">🎁</span>
            <span>Browse all rewards</span>
            <span class="rewards-cta__arrow" aria-hidden="true">→</span>
          </button>
        </p>
        <p class='rewards-cta'>
          <button class="rewards-cta__link" data-search="codes" type="button">
            <span class="rewards-cta__icon" aria-hidden="true">📜</span>
            <span>View codes</span>
            <span class="rewards-cta__arrow" aria-hidden="true">→</span>
          </button>
        </p>
      </div>
    </section>
  `;
}

/**
 * Render missing rewards section
 */
function renderMissingRewardsSection(ownedSets, setArtStore) {
  const ownedSetKeys = new Set(ownedSets);
  const allRewards = Object.entries(setArtStore);

  // Filter rewards into obtainable and legacy (unobtainable)
  const missingObtainable = [];
  const missingLegacy = [];

  allRewards.forEach(([key, data]) => {
    if (!ownedSetKeys.has(key)) {
      if (data.obtainable === false) {
        missingLegacy.push([key, data]);
      } else {
        missingObtainable.push([key, data]);
      }
    }
  });

  const hasMissingObtainable = missingObtainable.length > 0;
  const hasMissingLegacy = missingLegacy.length > 0;

  if (!hasMissingObtainable && !hasMissingLegacy) {
    return ''; // Player has everything, don't show section
  }

  const obtainableContent = hasMissingObtainable
    ? missingObtainable.map(([key, data]) => renderMissingRewardCard(key, data, false)).join('')
    : '';

  const legacyContent = hasMissingLegacy
    ? missingLegacy.map(([key, data]) => renderMissingRewardCard(key, data, true)).join('')
    : '';

  const obtainableSection = hasMissingObtainable
    ? `
    <div class="missing-rewards__obtainable">
      <button id="missing-obtainable-toggle" class="missing-rewards__toggle" type="button" aria-expanded="false">
        <span class="missing-rewards__toggle-icon" aria-hidden="true">▶</span>
        <span>Still Obtainable (${missingObtainable.length})</span>
      </button>
      <div id="missing-obtainable-panel" class="missing-rewards__panel" hidden>
        <p class="missing-rewards__description">These rewards can still be unlocked through gameplay or events.</p>
        <div class="sets-grid sets-grid--missing">
          ${obtainableContent}
        </div>
      </div>
    </div>
  `
    : '';

  const legacySection = hasMissingLegacy
    ? `
    <div class="missing-rewards__legacy">
      <button id="missing-legacy-toggle" class="missing-rewards__toggle missing-rewards__toggle--legacy" type="button" aria-expanded="false">
        <span class="missing-rewards__toggle-icon" aria-hidden="true">▶</span>
        <span>No Longer Obtainable (${missingLegacy.length})</span>
      </button>
      <div id="missing-legacy-panel" class="missing-rewards__panel" hidden>
        <p class="missing-rewards__description missing-rewards__description--legacy">These rewards were available during past events and can no longer be unlocked.</p>
        <div class="sets-grid sets-grid--missing sets-grid--legacy">
          ${legacyContent}
        </div>
      </div>
    </div>
  `
    : '';

  return `
    <section class="missing-rewards-section">
      <h3 class="section-title">Missing Rewards</h3>
      ${obtainableSection}
      ${legacySection}
    </section>
  `;
}

/**
 * Render a missing reward card
 */
function renderMissingRewardCard(setKey, data, isLegacy = false) {
  const label = data?.label || formatLabel(setKey);
  const description =
    data?.descriptionLocked || data?.description || `Unlock this reward by obtaining the ${label}.`;
  const imageSources =
    Array.isArray(data?.images) && data.images.length
      ? data.images
      : [data?.image || UNKNOWN_ITEM_IMAGE];
  const altText = data?.alt || label;
  const imageMarkup = imageSources
    .map((imageSource, index) => {
      const isFallbackImage = imageSource === UNKNOWN_ITEM_IMAGE;
      const proxied = proxiedImageUrl(imageSource);
      const fallbackClass = isFallbackImage ? ' pixelated-image' : '';
      const activeClass = index === 0 ? ' is-active' : '';
      const imgAlt = imageSources.length > 1 ? `${altText} view ${index + 1}` : altText;
      return `<img class="set-card__media-img${activeClass}${fallbackClass}" src="${proxied}" alt="${escapeHtml(imgAlt)}" loading="lazy" decoding="async" fetchpriority="low" width="56" height="56" referrerpolicy="no-referrer" onerror="this.onerror=null;this.referrerPolicy='no-referrer';this.src='${imageSource}'">`;
    })
    .join('');

  const legacyClass = isLegacy ? ' set-card--legacy' : '';

  return `
    <button class="set-card set-card--missing${legacyClass}" type="button" data-set-key="${setKey}">
      <div class="set-card__media">
        ${imageMarkup}
      </div>
      <div class="set-card__content">
        <span class="set-card__name">${escapeHtml(label)}</span>
        <p class="set-card__description">${escapeHtml(description)}</p>
      </div>
    </button>
  `;
}

/**
 * Render an individual set card
 */
function renderSetCard(setKey, isNew = false) {
  const setArtStore = getSetArtStore();
  const asset = setArtStore?.[setKey];
  const label = asset?.label || formatLabel(setKey);
  const description =
    asset?.descriptionObtained ||
    asset?.description ||
    asset?.descriptionLocked ||
    `You unlocked ${label}.`;

  const imageSources =
    Array.isArray(asset?.images) && asset.images.length
      ? asset.images
      : [asset?.image || UNKNOWN_ITEM_IMAGE];
  const altText = asset?.alt || label;
  const imageMarkup = imageSources
    .map((imageSource, index) => {
      const isFallbackImage = imageSource === UNKNOWN_ITEM_IMAGE;
      const proxied = proxiedImageUrl(imageSource);
      const fallbackClass = isFallbackImage ? ' pixelated-image' : '';
      const activeClass = index === 0 ? ' is-active' : '';
      const imgAlt = imageSources.length > 1 ? `${altText} view ${index + 1}` : altText;
      return `<img class="set-card__media-img${activeClass}${fallbackClass}" src="${proxied}" alt="${escapeHtml(imgAlt)}" loading="lazy" decoding="async" fetchpriority="low" width="56" height="56" referrerpolicy="no-referrer" onerror="this.onerror=null;this.referrerPolicy='no-referrer';this.src='${imageSource}'">`;
    })
    .join('');

  const newBadge = isNew
    ? `<span class=\"set-card__badge\" aria-label=\"New unlock\">New</span>`
    : '';
  const extraClass = isNew ? ' set-card--new' : '';

  return `
    <button class="set-card${extraClass}" type="button" data-set-key="${setKey}">
      <div class="set-card__media">
        ${imageMarkup}
      </div>
      <div class="set-card__content">
        <span class="set-card__name">${escapeHtml(label)}</span>
        <p class="set-card__description">${escapeHtml(description)}</p>
      </div>
      ${newBadge}
    </button>
  `;
}

/**
 * Render the patreon tiers section
 */
function renderTiersSection(tiers, iskall85Tiers = []) {
  const vaultHuntersPatreonUrl =
    'https://patreon.com/VaultHunters?utm_source=massuus.com&utm_medium=massuus.com&utm_campaign=creatorshare_fan&utm_content=join_link';
  const iskall85PatreonUrl =
    'https://patreon.com/iskall85?utm_source=massuus.com&utm_medium=massuus.com&utm_campaign=creatorshare_fan&utm_content=join_link';
  const vaultHuntersTierConfig = {
    'vault legend': { color: '#71ff9e', badge: '/img/badge/legend.webp' },
    'vault champion': { color: '#a2ff00', badge: '/img/badge/champion.webp' },
    'vault goblin': { color: '#00ff6c', badge: '/img/badge/goblin.webp' },
    'vault cheeser': { color: '#f3dc00', badge: '/img/badge/cheeser.webp' },
    'vault dweller': { color: '#dc1717', badge: '/img/badge/dweller.webp' },
  };
  return `
    <section class="tiers-section">
      ${renderTierGroup(
        'Vault Hunter Patreon Tiers',
        tiers,
        'Vault Hunters Patreon',
        vaultHuntersTierConfig,
        vaultHuntersPatreonUrl
      )}
      ${renderTierGroup(
        'Iskall85 Patreon Tiers',
        iskall85Tiers,
        'Iskall85 Patreon',
        ISKALL85_TIER_CONFIG,
        iskall85PatreonUrl
      )}
    </section>
  `;
}

function renderTierGroup(title, tiers, patreonLabel, tierConfig, patreonUrl) {
  const hasTiers = Array.isArray(tiers) && tiers.length > 0;
  const items = hasTiers ? tiers.map((tier) => renderTierCard(tier, tierConfig)).join('') : '';

  return `
    <div class="tiers-group">
      <h3 class="section-title">${title}</h3>
      ${
        hasTiers
          ? `<ul class="tiers-list">${items}</ul>`
          : `<p class="muted">No tiers unlocked yet. <a class="external-link" href="${patreonUrl}" target="_blank" rel="noopener">${patreonLabel}</a></p>`
      }
    </div>
  `;
}

function renderTierCard(tier, tierConfig) {
  const label =
    tier && typeof tier === 'object' ? tier.name || formatLabel(tier.id) : formatLabel(tier);
  const tierKey = label.toLowerCase();
  const config = tierConfig?.[tierKey];

  if (config) {
    return `<li class="tiers-list__item" style="--tier-accent: ${config.color}"><img class="tier-badge pixelated-image" src="${config.badge}" alt="${label} badge" width="24" height="24" onerror="this.onerror=null;this.src='${UNKNOWN_ITEM_IMAGE}'"><span class="tiers-list__label">${label}</span></li>`;
  }

  return `<li class="tiers-list__item"><img class="tier-badge pixelated-image" src="${UNKNOWN_ITEM_IMAGE}" alt="${label} badge" width="24" height="24"><span class="tiers-list__label">${label}</span></li>`;
}

/**
 * Render the extra info section
 */
function renderExtraSection(rewards) {
  const hasRewards = Object.keys(rewards).length > 0;
  const panelContent = hasRewards
    ? renderRewardsList(rewards)
    : '<p class="muted">No individual rewards recorded.</p>';

  return `
    <section>
      <button id="extra-toggle" class="extra-toggle" type="button" aria-expanded="false">Extra Info</button>
      <div id="extra-panel" class="rewards-panel hidden">${panelContent}</div>
    </section>
  `;
}

/**
 * Render the list of individual rewards
 */
function renderRewardsList(rewards) {
  return Object.entries(rewards)
    .map(([group, items]) => {
      const normalizedItems = Array.isArray(items) ? items : [];
      const groupLabelRaw = String(group);
      const groupLabelKey = groupLabelRaw.includes(':')
        ? groupLabelRaw.split(':').pop()
        : groupLabelRaw;
      const groupLabelClean = groupLabelKey.replace(/[_\\/]+/g, ' ');
      const groupHeading = formatLabel(groupLabelClean);

      const rows = normalizedItems
        .map((item) => {
          const raw = String(item).trim();
          // Strip leading /img/ and extension, then normalize
          const withoutPrefix = raw.replace(/^\/?img\//i, '');
          const withoutExt = withoutPrefix.replace(/\.(webp|png|jpg|jpeg|gif)$/i, '');
          const normalizedPath = withoutExt.replace(/\s+/g, '_').toLowerCase();
          const path = normalizedPath || withoutExt || raw;

          const segments = normalizedPath.split(/[\\/]/);
          const lastSegment = segments[segments.length - 1] || normalizedPath;
          const name = deriveRewardName(lastSegment || raw);

          // Improve name for generic armor pieces using parent armor set
          let displayName = name;
          const pathParts = normalizedPath.split(/[\/\\:]/);
          if (['boots', 'helmet', 'leggings', 'chestplate'].includes(lastSegment)) {
            // Try to get armor set name from path hierarchy
            const armorSetIdx = pathParts.indexOf('armor');
            if (armorSetIdx >= 0 && armorSetIdx + 1 < pathParts.length) {
              const armorSet = pathParts[armorSetIdx + 1];
              displayName = deriveRewardName(armorSet);
            }
          }
          // For companions, clean up "The Vault:" prefix
          if (normalizedPath.startsWith('the_vault:') && !normalizedPath.includes('/')) {
            const compName = normalizedPath.replace(/^the_vault:/, '');
            displayName = deriveRewardName(compName);
          }

          const safeName = displayName ? escapeHtml(displayName) : '';
          const safePath = path ? escapeHtml(path) : '';
          return `<tr><td>${safeName}</td><td><code>${safePath}</code></td></tr>`;
        })
        .join('');

      return `
        <div class="reward-group">
          <h3>${groupHeading}</h3>
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

/**
 * Bind the share button click handler
 */
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
    await copyShareLink(link, shareFeedback, updateShareFeedback);
  });
}

/**
 * Bind click handlers to set cards
 */
function bindSetCardHandlers() {
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

/**
 * Bind CTA button handlers (Browse all rewards, View codes)
 */
function bindCtaButtonHandlers() {
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

/**
 * Bind disclosure toggle for collapsible sections
 */
function bindDisclosureToggle(toggleId, panelId) {
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

  // Ensure initial chevron matches current state
  const initialExpanded = toggle.getAttribute('aria-expanded') === 'true';
  setChevronForState(initialExpanded);

  toggle.addEventListener('click', () => {
    const wasExpanded = toggle.getAttribute('aria-expanded') === 'true';
    const nextExpanded = !wasExpanded;
    toggle.setAttribute('aria-expanded', String(nextExpanded));

    // Toggle visibility - check which method this panel uses
    if (panel.hasAttribute('hidden') || nextExpanded === false) {
      // Use attribute-based toggling
      if (nextExpanded) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    }
    // Also handle class-based toggling for backwards compatibility
    if (panel.classList.contains('hidden') || (!panel.hasAttribute('hidden') && !nextExpanded)) {
      panel.classList.toggle('hidden');
    }

    setChevronForState(nextExpanded);
  });
}
