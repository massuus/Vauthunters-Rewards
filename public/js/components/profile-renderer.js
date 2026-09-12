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
  renderCompanionStatsSection,
} from './profile-sections.js';
import {
  bindServerLinkHandlers,
  bindShareButton,
  bindSetCardHandlers,
  bindCtaButtonHandlers,
  bindDisclosureToggle,
  bindLeaderboardLevelHandlers,
} from './profile-interactions.js';
import { clearLeaderboardCache } from '../features/leaderboard.js';
import { syncActiveNavigation } from './navigation.js';

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

export function renderAlternateNames(data) {
  const minecraftName = String(data?.name || '').trim();
  const seen = new Set(minecraftName ? [minecraftName.toLowerCase()] : []);
  const names = [];
  const addName = (label, value) => {
    const name = String(value || '').trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(`<span><strong>${label}:</strong> ${escapeHtml(name)}</span>`);
  };

  addName('Twitch', data?.twitchUsername);
  for (const entry of Array.isArray(data?.companionStats) ? data.companionStats : []) {
    addName('Twitch', entry?.twitchName);
  }
  for (const entry of Array.isArray(data?.companionStats) ? data.companionStats : []) {
    addName('Alias', entry?.alias);
  }

  return names.length
    ? `<div class="player-alternate-names" aria-label="Other player names">${names.join('')}</div>`
    : '';
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
  const leaderboardPlace = data?.leaderboardPlace || null;
  const isUnlinked = data.minecraftLinked === false;
  const searchName = isUnlinked ? `twitch:${data.twitchUsername}` : data.name;
  const usernameKey = String(searchName || '')
    .trim()
    .toLowerCase();
  const previouslySeen = getSeenSets(usernameKey);

  const isReturningPlayer = previouslySeen.size > 0;
  const newSetKeys = isReturningPlayer
    ? new Set(sets.filter((s) => !previouslySeen.has(s)))
    : new Set();

  const setsSection = renderSetsSection(sets, setsHelpTemplate, newSetKeys);
  const missingRewardsSection = renderMissingRewardsSection(sets, setArtStore);
  const tiersSection = renderTiersSection(tiers, iskall85Tiers, ISKALL85_TIER_CONFIG);
  const extraSection = renderExtraSection(rewards);
  const companionStatsSection = renderCompanionStatsSection(data?.companionStats, data?.name);
  const shareUrl = getShareUrl(searchName);

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
  let leaderboardBadge = '';
  try {
    const servers = isUnlinked ? [] : await fetchOfficialServers();
    const matchedServer = findServerByPlayerName(data.name, servers);
    if (matchedServer?._id && matchedServer?.name) {
      const serverQuery = escapeHtml(matchedServer.name);
      const serverName = escapeHtml(matchedServer.name);
      serverLink = `<button class="player-server-link" type="button" data-server-query="${serverQuery}" title="View ${serverName} players">${serverName}</button>`;
    }
  } catch {
    // Non-blocking: profile rendering should continue even if server lookup fails.
  }

  if (leaderboardPlace?.rank !== undefined && leaderboardPlace?.rank !== null) {
    const safeName = escapeHtml(data.name || 'player');
    leaderboardBadge = `<button class="player-server-link player-level-link" type="button" data-leaderboard-player="${safeName}" title="Open the leaderboard around ${safeName}">Leaderboard #${escapeHtml(String(leaderboardPlace.rank))}</button>`;
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
      levelBadge: leaderboardBadge,
      alternateNames: renderAlternateNames(data),
      avatarAlt: isUnlinked ? 'Vault Hunters rewards' : `${escapeHtml(data.name)}'s Minecraft head`,
      accountNotice: isUnlinked
        ? `<aside class="player-link-notice" aria-label="Minecraft account linking"><div class="player-link-notice__copy"><strong>Minecraft account not linked yet</strong><p>Your companion and rewards are shown below. Is this your Twitch account? Link Minecraft to use your rewards in game.</p></div><a href="https://rewards.vaulthunters.gg/connect/link" class="player-link-notice__action">Link Minecraft account <span aria-hidden="true">&rarr;</span></a></aside>`
        : '',
    }) +
    companionStatsSection +
    setsSection +
    missingRewardsSection +
    tiersSection +
    extraSection;

  resultContainer.classList.remove('hidden');

  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}?user=${encodeURIComponent(searchName)}`
  );
  syncActiveNavigation();

  bindShareButton();
  bindServerLinkHandlers();
  bindLeaderboardLevelHandlers();
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

  // Profile lookups may update leaderboard rows server-side; clear stale local leaderboard pages.
  clearLeaderboardCache();

  addRecentUser({ name: searchName, head: data.head, tier: tiers });
  await renderRecentSection();
}
