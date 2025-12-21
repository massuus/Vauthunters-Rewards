// Profile rendering and display functions

import { logger } from '../core/logger.js';
import { loadTemplate, renderTemplate } from '../loaders/template-loader.js';
import { resultContainer, proxiedImageUrl, setMetaDescription, setFavicon, DEFAULT_FAVICON, UNKNOWN_ITEM_IMAGE, usernameInput, form } from '../utils/dom-utils.js';
import { escapeHtml, toSnake, deriveRewardPath, deriveRewardName, augmentSets, formatLabel } from '../features/reward-utils.js';
import { loadSetArt, getSetArtStore, closeSetDetailModal, openSetDetailModal } from './set-art-manager.js';
import { getShareUrl } from '../features/url-state.js';
import { getSeenSets, setSeenSets, addRecentUser } from '../utils/storage-manager.js';
import { copyShareLink } from '../utils/clipboard-utils.js';
import { updateShareFeedback } from '../features/ui-feedback.js';
import { getBestPatreonTier } from '../utils/tier-utils.js';

let setsHelpTemplate = '';

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
  const rewards = data.rewards && typeof data.rewards === 'object' ? data.rewards : {};
  const usernameKey = (data && data.name ? String(data.name) : '').trim().toLowerCase();
  const previouslySeen = getSeenSets(usernameKey);
  
  // Only show "New" badges if the player was already in the cache (previouslySeen has items)
  const isReturningPlayer = previouslySeen.size > 0;
  const newSetKeys = isReturningPlayer ? new Set(sets.filter((s) => !previouslySeen.has(s))) : new Set();

  const setsSection = renderSetsSection(sets, newSetKeys);
  const tiersSection = renderTiersSection(tiers);
  const extraSection = renderExtraSection(rewards);
  const shareUrl = getShareUrl(data.name);

  // Get best Patreon tier for user badge and name styling
  const bestTier = getBestPatreonTier(tiers);
  const nameStyle = bestTier ? `color: ${bestTier.color}; font-weight: 600;` : '';
  const tierBadge = bestTier ? `<img class="tier-badge pixelated-image" src="${bestTier.badge}" alt="${bestTier.name} badge" title="${bestTier.name}" width="24" height="24">` : '';

  const playerCard = await loadTemplate('player-card');
  resultContainer.innerHTML = renderTemplate(playerCard, {
    head: proxiedImageUrl(data.head),
    name: data.name,
    shareUrl: shareUrl,
    nameStyle: nameStyle,
    tierBadge: tierBadge
  }) + setsSection + tiersSection + extraSection;

  resultContainer.classList.remove('hidden');

  // Update query string manually
  window.history.replaceState({}, '', `${window.location.pathname}?user=${encodeURIComponent(data.name)}`);
  
  bindShareButton();
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

  // Persist the current sets so future lookups can detect new ones (per-player)
  setSeenSets(usernameKey, new Set(sets));

  // Update recent list with both name and head
  addRecentUser({ name: data.name, head: data.head, tier: tiers });
  await renderRecentSection();
}

/**
 * Render the vault sets section
 */
function renderSetsSection(sets, newSetKeys = new Set()) {
  const hasSets = sets.length > 0;
  const setsContent = hasSets ? sets.map((setKey) => renderSetCard(setKey, newSetKeys.has(setKey))).join('') : '';
  
  return `
    <section>
      <h3 class='section-title'>Vault Sets</h3>
      ${hasSets ? `<div class='sets-grid'>${setsContent}</div>` : `<p class='muted'>No sets recorded yet.</p>`}
      <div class='rewards-cta-container'>
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
      ${setsHelpTemplate}
    </section>
  `;
}

/**
 * Render an individual set card
 */
function renderSetCard(setKey, isNew = false) {
  const setArtStore = getSetArtStore();
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

/**
 * Render the patreon tiers section
 */
function renderTiersSection(tiers) {
  const title = 'Patreon Tiers Unlocked';
  const hasTiers = tiers.length > 0;

  const tierConfig = {
    'vault legend': { color: '#71ff9e', badge: '/img/badge/legend.webp' },
    'vault champion': { color: '#a2ff00', badge: '/img/badge/champion.webp' },
    'vault goblin': { color: '#00ff6c', badge: '/img/badge/goblin.webp' },
    'vault cheeser': { color: '#f3dc00', badge: '/img/badge/cheeser.webp' },
    'vault dweller': { color: '#dc1717', badge: '/img/badge/dweller.webp' }
  };

  const items = hasTiers ? tiers
    .map((tier) => {
      const label = tier && typeof tier === 'object'
        ? tier.name || formatLabel(tier.id)
        : formatLabel(tier);
      const tierKey = label.toLowerCase();
      const config = tierConfig[tierKey];
      
      if (config) {
        return `<li style="color: ${config.color}"><img class="tier-badge pixelated-image" src="${config.badge}" alt="${label} badge" width="24" height="24">${label}</li>`;
      }
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

/**
 * Render the extra info section
 */
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

/**
 * Render the list of individual rewards
 */
function renderRewardsList(rewards) {
  return Object.entries(rewards)
    .map(([group, items]) => {
      const normalizedItems = Array.isArray(items) ? items : [];
      const groupLabelRaw = String(group);
      const groupLabelKey = groupLabelRaw.includes(':') ? groupLabelRaw.split(':').pop() : groupLabelRaw;
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

  if (!cards.length) {
    return;
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => openSetDetailModal(card.dataset.setKey));
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
