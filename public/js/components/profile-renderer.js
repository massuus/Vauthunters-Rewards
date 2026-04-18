// Profile rendering and display functions

import { logger } from '../core/logger.js';
import { loadTemplate, renderTemplate } from '../loaders/template-loader.js';
import {
  resultContainer,
  proxiedImageUrl,
  setMetaDescription,
  setFavicon,
} from '../utils/dom-utils.js';
import { escapeHtml, augmentSets } from '../features/reward-utils.js';
import { loadSetArt, getSetArtStore, closeSetDetailModal } from './set-art-manager.js';
import { getShareUrl } from '../features/url-state.js';
import { getSeenSets, setSeenSets, addRecentUser } from '../utils/storage-manager.js';
import { getBestPatreonTier } from '../utils/tier-utils.js';
import { fetchOfficialServers, findServerByPlayerName } from '../features/official-servers.js';
import {
  renderSetsSection,
  renderMissingRewardsSection,
  renderTiersSection,
  renderExtraSection,
} from './profile-sections.js';
import {
  bindServerLinkHandlers,
  bindShareButton,
  bindSetCardHandlers,
  bindCtaButtonHandlers,
  bindDisclosureToggle,
} from './profile-interactions.js';

let setsHelpTemplate = '';

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

  const isReturningPlayer = previouslySeen.size > 0;
  const newSetKeys = isReturningPlayer
    ? new Set(sets.filter((s) => !previouslySeen.has(s)))
    : new Set();

  const setsSection = renderSetsSection(sets, setsHelpTemplate, newSetKeys);
  const missingRewardsSection = renderMissingRewardsSection(sets, setArtStore);
  const tiersSection = renderTiersSection(tiers, iskall85Tiers, ISKALL85_TIER_CONFIG);
  const extraSection = renderExtraSection(rewards);
  const shareUrl = getShareUrl(data.name);

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

  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}?user=${encodeURIComponent(data.name)}`
  );

  bindShareButton();
  bindServerLinkHandlers();
  bindSetCardHandlers();
  bindCtaButtonHandlers();

  setFavicon(data.head);
  if (data && data.name) {
    document.title = `${data.name} - Vault Hunters Rewards`;
    setMetaDescription(`Vault Hunters rewards for ${data.name}: sets, tiers, and more.`);
  }

  bindDisclosureToggle('extra-toggle', 'extra-panel');
  bindDisclosureToggle('unlocks-toggle', 'unlocks-panel');
  bindDisclosureToggle('missing-obtainable-toggle', 'missing-obtainable-panel');
  bindDisclosureToggle('missing-legacy-toggle', 'missing-legacy-panel');

  setSeenSets(usernameKey, new Set(sets));

  addRecentUser({ name: data.name, head: data.head, tier: tiers });
  await renderRecentSection();
}
