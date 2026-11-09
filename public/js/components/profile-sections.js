import { getLockedRewardDescription, renderRewardShop } from '../features/reward-shop.js';
import { proxiedImageUrl, UNKNOWN_ITEM_IMAGE } from '../utils/dom-utils.js';
import {
  buildLinkedRewardHtml,
  escapeHtml,
  deriveRewardName,
  formatLabel,
} from '../features/reward-utils.js';
import { getSetArtStore } from '../features/set-art.js';
import {
  renderIndividualRewardModelPreview,
  renderRewardModelPreview,
} from '../features/reward-model-preview.js';

export function renderCompanionStatsSection(companionStats, playerName = '') {
  const stats = Array.isArray(companionStats) ? companionStats : [];
  if (!stats.length) return '';

  const cards = stats
    .map((entry) => {
      const rawStreamer = String(entry?.streamer || 'Unknown streamer');
      const rawTargetPlayer = String(entry?.twitchName || playerName || '').trim();
      const streamer = escapeHtml(rawStreamer);
      const targetPlayer = escapeHtml(rawTargetPlayer);
      const seasonLevel = Math.max(0, Number(entry?.seasonLevel || 0));
      const vaultsJoined = Math.max(0, Number(entry?.vaultsJoined || 0));
      const renderStatButton = (metric, label, value, rank) => {
        const safeRank =
          Number.isFinite(Number(rank)) && Number(rank) > 0
            ? ` <small aria-label="rank ${Math.floor(Number(rank))}">#${Math.floor(Number(rank))}</small>`
            : '';
        return `
        <button
          class="companion-profile-card__stat player-level-link"
          type="button"
          data-leaderboard-player="${targetPlayer}"
          data-leaderboard-metric="${metric}"
          data-leaderboard-streamer="${streamer}"
          title="Open ${streamer}'s ${label.toLowerCase()} leaderboard around ${targetPlayer}"
        >
          <span>${label}</span>
          <strong>${value}${safeRank}</strong>
        </button>`;
      };

      return `
        <article class="companion-profile-card">
          <p class="companion-profile-card__streamer">
            <span>Streamer:</span>
            <strong>${streamer}</strong>
          </p>
          <div class="companion-profile-card__stats">
            ${renderStatButton('seasonLevel', 'Season level', seasonLevel, entry?.seasonLevelRank)}
            ${renderStatButton('vaultsJoined', 'Vaults joined', vaultsJoined, entry?.vaultsJoinedRank)}
          </div>
        </article>
      `;
    })
    .join('');

  return `
    <section class="companion-profile-section" aria-labelledby="companion-profile-title">
      <h3 class="section-title" id="companion-profile-title">Companion progress</h3>
      <div class="companion-profile-grid">${cards}</div>
    </section>
  `;
}

function individualRewardDetails(rawItem) {
  const raw = String(rawItem || '').trim();
  const normalizedPath = raw
    .replace(/^\/?img\//i, '')
    .replace(/\.(webp|png|jpg|jpeg|gif)$/i, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
  const segments = normalizedPath.split(/[\\/:]/).filter(Boolean);
  const lastSegment = segments.at(-1) || normalizedPath;
  let name = deriveRewardName(lastSegment);
  if (['boots', 'helmet', 'leggings', 'chestplate'].includes(lastSegment)) {
    const armorIndex = segments.indexOf('armor');
    if (armorIndex >= 0 && segments[armorIndex + 1]) {
      name = `${deriveRewardName(segments[armorIndex + 1])} ${deriveRewardName(lastSegment)}`;
    }
  }
  return { name, path: normalizedPath || raw };
}

function renderIndividualRewards(rewards) {
  return Object.entries(rewards || {})
    .map(([category, items]) => {
      const entries = Array.isArray(items) ? items : [];
      if (!entries.length) return '';
      const categoryKey = String(category)
        .split(':')
        .pop()
        .replace(/[_\\/]+/g, ' ');
      const cards = entries
        .map((item) => {
          const { name, path } = individualRewardDetails(item);
          const modelPreview = renderIndividualRewardModelPreview(path);
          return `
            <article class="set-card set-card--individual" tabindex="0" data-set-key="${escapeHtml(path)}">
              ${modelPreview ? `<div class="set-card__media">${modelPreview}</div>` : ''}
              <div class="set-card__content">
                <span class="set-card__name">${escapeHtml(name)}</span>
                <p class="set-card__description"><code>${escapeHtml(path)}</code></p>
              </div>
            </article>`;
        })
        .join('');
      return `<h4 class="profile-reward-category">${escapeHtml(formatLabel(categoryKey))} (${entries.length})</h4>${cards}`;
    })
    .join('');
}

export function renderSetsSection(sets, setsHelpTemplate, newSetKeys = new Set(), rewards = {}) {
  const hasSets = sets.length > 0;
  const individualRewardCount = Object.values(rewards || {}).reduce(
    (total, items) => total + (Array.isArray(items) ? items.length : 0),
    0
  );
  const setArtStore = getSetArtStore();
  const setsContent = hasSets
    ? sets.map((setKey) => renderSetCard(setKey, setArtStore, newSetKeys.has(setKey))).join('')
    : '';

  return `
    <section>
      <div class="section-title-container profile-rewards-heading">
        <h3 class='section-title' data-rewards-title>Vault Sets (${sets.length})</h3>
        <div class="profile-reward-controls">
        <select class="profile-reward-sort" data-card-size-control aria-label="Reward card size">
          <option value="regular">Regular cards</option>
          <option value="compact">Compact cards</option>
          <option value="small">Small cards</option>
        </select>
        <select class="profile-reward-sort" data-reward-sort aria-label="Reward order">
          <option value="newest">Newest first</option>
          <option value="unlocked">Unlock order</option>
          <option value="category">Category</option>
          <option value="individual">Individual rewards</option>
        </select>
        </div>
      </div>
      ${setsHelpTemplate}
      ${hasSets ? `<div class='sets-grid' id='profile-unlocked-rewards'>${setsContent}</div>` : `<p class='muted'>No sets recorded yet.</p>`}
      <div class="sets-grid hidden" data-individual-rewards data-reward-count="${individualRewardCount}">
        ${individualRewardCount ? renderIndividualRewards(rewards) : '<p class="muted">No individual rewards recorded.</p>'}
      </div>
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

export function renderMissingRewardsSection(ownedSets, setArtStore) {
  const ownedSetKeys = new Set(ownedSets);
  const allRewards = Object.entries(setArtStore).filter(([, data]) => !data?.profileOnly);

  const missingObtainable = [];
  const missingLegacy = [];
  const missingUpcoming = [];

  allRewards.forEach(([key, data]) => {
    if (!ownedSetKeys.has(key)) {
      if (data.upcoming === true) {
        missingUpcoming.push([key, data]);
      } else if (data.obtainable === false) {
        missingLegacy.push([key, data]);
      } else {
        missingObtainable.push([key, data]);
      }
    }
  });

  const hasMissingObtainable = missingObtainable.length > 0;
  const hasMissingLegacy = missingLegacy.length > 0;

  if (!hasMissingObtainable && !hasMissingLegacy && !missingUpcoming.length) {
    return '';
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
        <p class="missing-rewards__description">These rewards can still be unlocked through gameplay, events, or the companion shop.</p>
        <div class="sets-grid sets-grid--missing" data-sortable-rewards>
          ${obtainableContent}
        </div>
      </div>
    </div>
  `
    : '';

  const upcomingSection = missingUpcoming.length
    ? `
    <div class="missing-rewards__upcoming">
      <button id="missing-upcoming-toggle" class="missing-rewards__toggle" type="button" aria-expanded="false" aria-controls="missing-upcoming-panel">
        <span class="missing-rewards__toggle-icon" aria-hidden="true">▶</span>
        <span>Coming Soon™ (${missingUpcoming.length})</span>
      </button>
      <div id="missing-upcoming-panel" class="missing-rewards__panel" hidden>
        <p class="missing-rewards__description">These rewards will become obtainable in the future, but cannot be unlocked yet.</p>
        <div class="sets-grid sets-grid--missing" data-sortable-rewards>
          ${missingUpcoming.map(([key, data]) => renderMissingRewardCard(key, data)).join('')}
        </div>
      </div>
    </div>`
    : '';

  const legacySection = hasMissingLegacy
    ? `
    <div class="missing-rewards__legacy">
      <button id="missing-legacy-toggle" class="missing-rewards__toggle missing-rewards__toggle--legacy" type="button" aria-expanded="false">
        <span class="missing-rewards__toggle-icon" aria-hidden="true">▶</span>
        <span>Currently Unavailable (${missingLegacy.length})</span>
      </button>
      <div id="missing-legacy-panel" class="missing-rewards__panel" hidden>
        <p class="missing-rewards__description missing-rewards__description--legacy">These rewards are not currently available through their original unlock method or the shop.</p>
        <div class="sets-grid sets-grid--missing sets-grid--legacy" data-sortable-rewards>
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
      ${upcomingSection}
      ${legacySection}
    </section>
  `;
}

function renderMissingRewardCard(setKey, data, isLegacy = false) {
  const label = data?.label || formatLabel(setKey);
  const description = getLockedRewardDescription(
    data,
    `Unlock this reward by obtaining the ${label}.`
  );
  const imageSources =
    Array.isArray(data?.images) && data.images.length
      ? data.images
      : [data?.image || UNKNOWN_ITEM_IMAGE];
  const altText = data?.alt || label;
  const imageParts = imageSources.map((imageSource, index) => {
    const isFallbackImage = imageSource === UNKNOWN_ITEM_IMAGE;
    const proxied = proxiedImageUrl(imageSource);
    const fallbackClass = isFallbackImage ? ' pixelated-image' : '';
    const activeClass = index === 0 ? ' is-active' : '';
    const imgAlt = imageSources.length > 1 ? `${altText} view ${index + 1}` : altText;
    return `<img class="set-card__media-img${activeClass}${fallbackClass}" src="${proxied}" alt="${escapeHtml(imgAlt)}" loading="lazy" decoding="async" fetchpriority="low" width="56" height="56" referrerpolicy="no-referrer" onerror="this.onerror=null;this.referrerPolicy='no-referrer';this.src='${imageSource}'">`;
  });
  const imageMarkup = imageParts.join('');

  const legacyClass = isLegacy ? ' set-card--legacy' : '';

  return `
    <article class="set-card set-card--missing${legacyClass}" tabindex="0" data-set-key="${setKey}">
      <div class="set-card__media">
        ${renderRewardModelPreview(setKey, imageMarkup, imageParts)}
      </div>
      <div class="set-card__content">
        <span class="set-card__name">${escapeHtml(label)}</span>
        <p class="set-card__description">${buildLinkedRewardHtml(description)}</p>
        ${renderRewardShop(data)}
      </div>
    </article>
  `;
}

function renderSetCard(setKey, setArtStore, isNew = false) {
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
  const imageParts = imageSources.map((imageSource, index) => {
    const isFallbackImage = imageSource === UNKNOWN_ITEM_IMAGE;
    const proxied = proxiedImageUrl(imageSource);
    const fallbackClass = isFallbackImage ? ' pixelated-image' : '';
    const activeClass = index === 0 ? ' is-active' : '';
    const imgAlt = imageSources.length > 1 ? `${altText} view ${index + 1}` : altText;
    return `<img class="set-card__media-img${activeClass}${fallbackClass}" src="${proxied}" alt="${escapeHtml(imgAlt)}" loading="lazy" decoding="async" fetchpriority="low" width="56" height="56" referrerpolicy="no-referrer" onerror="this.onerror=null;this.referrerPolicy='no-referrer';this.src='${imageSource}'">`;
  });
  const imageMarkup = imageParts.join('');

  const newBadge = isNew ? `<span class="set-card__badge" aria-label="New unlock">New</span>` : '';
  const extraClass = isNew ? ' set-card--new' : '';

  return `
    <article class="set-card${extraClass}" tabindex="0" data-set-key="${setKey}">
      <div class="set-card__media">
        ${renderRewardModelPreview(setKey, imageMarkup, imageParts)}
      </div>
      <div class="set-card__content">
        <span class="set-card__name">${escapeHtml(label)}</span>
        <p class="set-card__description">${buildLinkedRewardHtml(description)}</p>
        ${renderRewardShop(asset, true)}
      </div>
      ${newBadge}
    </article>
  `;
}

export function renderTiersSection(tiers, iskall85Tiers = [], iskall85TierConfig = {}) {
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
        vaultHuntersPatreonUrl,
        '?patreons'
      )}
      ${renderTierGroup(
        'Iskall85 Patreon Tiers',
        iskall85Tiers,
        'Iskall85 Patreon',
        iskall85TierConfig,
        iskall85PatreonUrl,
        '?iskall85-patreons'
      )}
    </section>
  `;
}

function renderTierGroup(title, tiers, patreonLabel, tierConfig, patreonUrl, cardUrl = '') {
  const hasTiers = Array.isArray(tiers) && tiers.length > 0;
  const items = hasTiers
    ? tiers.map((tier) => renderTierCard(tier, tierConfig, cardUrl)).join('')
    : '';

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

function renderTierCard(tier, tierConfig, cardUrl = '') {
  const label =
    tier && typeof tier === 'object' ? tier.name || formatLabel(tier.id) : formatLabel(tier);
  const tierKey = label.toLowerCase();
  const config = tierConfig?.[tierKey];
  const content = config
    ? `<img class="tier-badge pixelated-image" src="${config.badge}" alt="${label} badge" width="24" height="24" onerror="this.onerror=null;this.src='${UNKNOWN_ITEM_IMAGE}'"><span class="tiers-list__label">${label}</span>`
    : `<img class="tier-badge pixelated-image" src="${UNKNOWN_ITEM_IMAGE}" alt="${label} badge" width="24" height="24"><span class="tiers-list__label">${label}</span>`;
  const linkedContent = cardUrl
    ? `<a class="tiers-list__link" href="${cardUrl}" aria-label="View all Vault Hunters Patreons">${content}</a>`
    : content;

  if (config) {
    return `<li class="tiers-list__item" style="--tier-accent: ${config.color}">${linkedContent}</li>`;
  }

  return `<li class="tiers-list__item">${linkedContent}</li>`;
}
