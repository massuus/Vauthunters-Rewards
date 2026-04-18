import { buildCodesLinkedHtml } from '../../features/reward-utils.js';

const ALL_QUERY_KEYWORDS = ['all', 'rewards'];
const SET_ART_DATA_URL = '/data/set-art.json';

let setArtDataPromise = null;

export function isAllQuery(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return ALL_QUERY_KEYWORDS.includes(normalized);
}

export async function fetchSetArtData() {
  if (!setArtDataPromise) {
    setArtDataPromise = fetch(SET_ART_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load set art data');
        }
        return response.json();
      })
      .then(async (data) => {
        const base = typeof data === 'object' && data !== null ? data : {};
        const apiSets = await fetchApiSets();
        return mergeApiSets(base, apiSets);
      })
      .catch((error) => {
        setArtDataPromise = null;
        throw error;
      });
  }

  return setArtDataPromise;
}

async function fetchApiSets() {
  try {
    const response = await fetch('/api/sets');
    if (!response.ok) {
      throw new Error('Failed to load API sets');
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function mergeApiSets(localSets, apiSets) {
  const merged = { ...(localSets || {}) };
  if (!Array.isArray(apiSets)) {
    return merged;
  }

  apiSets.forEach((item) => {
    const id = item?.id;
    if (!id || merged[id]) {
      return;
    }

    merged[id] = {
      label: item?.displayName,
      description: item?.description || undefined,
      obtainable: typeof item?.unavailable === 'boolean' ? !item.unavailable : undefined,
    };
  });

  return merged;
}

function renderRewardCard(setKey, setData, proxiedImageUrl, escapeHtml, formatLabel) {
  const label = setData?.label || formatLabel(setKey);
  const description = setData?.descriptionLocked || setData?.description || 'Unlockable reward';

  // Support both single image and multiple images
  let imageSources = [];
  if (setData?.images && Array.isArray(setData.images)) {
    imageSources = setData.images;
  } else if (setData?.image) {
    imageSources = [setData.image];
  } else {
    imageSources = ['/img/unknown_item.png'];
  }

  // Generate image HTML for all images
  const imagesHtml = imageSources
    .map((imageSource) => {
      const safeImage = proxiedImageUrl(imageSource);
      const isFallback = imageSource === '/img/unknown_item.png';
      const fallbackClass = isFallback ? ' class="pixelated-image"' : '';
      return `<img${fallbackClass} src="${safeImage}" alt="${escapeHtml(label)} icon" loading="lazy" decoding="async" width="72" height="72">`;
    })
    .join('');

  // Wrap images in container if there are multiple
  const imagesContainer =
    imageSources.length > 1 ? `<div class="reward-card__images">${imagesHtml}</div>` : imagesHtml;

  const safeName = escapeHtml(label);
  const safeDescription = buildCodesLinkedHtml(description);

  return `
    <article class="reward-card">
      <div class="reward-card__header">
        ${imagesContainer}
        <h3>${safeName}</h3>
      </div>
      <p class="reward-card__description">${safeDescription}</p>
    </article>
  `;
}

export async function renderAllRewardsPage(
  resultContainer,
  setFavicon,
  setMetaDescription,
  closeSetDetailModal,
  updateQueryString,
  proxiedImageUrl,
  escapeHtml,
  formatLabel,
  DEFAULT_FAVICON
) {
  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `
    <section class="all-rewards-page">
      <div class="all-rewards-page__loading">Loading all rewards...</div>
    </section>
  `;
  setFavicon(DEFAULT_FAVICON);
  document.title = 'All Vault Hunters Rewards';
  setMetaDescription('Browse all possible unlockable rewards in Vault Hunters.');
  closeSetDetailModal();

  try {
    const setArtData = await fetchSetArtData();
    const entries = Object.entries(setArtData);

    // Split rewards into obtainable and unobtainable
    const obtainableRewards = [];
    const unobtainableRewards = [];

    entries.forEach(([key, data]) => {
      if (data.obtainable === false) {
        unobtainableRewards.push([key, data]);
      } else {
        obtainableRewards.push([key, data]);
      }
    });

    const obtainableCards = obtainableRewards.length
      ? obtainableRewards
          .map(([key, data]) =>
            renderRewardCard(key, data, proxiedImageUrl, escapeHtml, formatLabel)
          )
          .join('')
      : '<p class="all-rewards-page__empty">No obtainable rewards available.</p>';

    const unobtainableCards = unobtainableRewards.length
      ? unobtainableRewards
          .map(([key, data]) =>
            renderRewardCard(key, data, proxiedImageUrl, escapeHtml, formatLabel)
          )
          .join('')
      : '';

    const unobtainableSection = unobtainableRewards.length
      ? `
      <section class="rewards-section rewards-section--unavailable">
        <header class="rewards-section__header">
          <h3 class="rewards-section__title">No Longer Obtainable</h3>
          <p class="rewards-section__description">These rewards were available during past events and can no longer be unlocked.</p>
          <p class="rewards-section__count">${unobtainableRewards.length} reward${unobtainableRewards.length !== 1 ? 's' : ''}</p>
        </header>
        <div class="rewards-grid rewards-grid--unavailable">
          ${unobtainableCards}
        </div>
      </section>
    `
      : '';

    resultContainer.innerHTML = `
      <section class="all-rewards-page" aria-live="polite">
        <header class="all-rewards-page__intro">
          <h2 class="all-rewards-page__title">All Vault Hunters Rewards</h2>
          <p class="all-rewards-page__lead">Browse every reward in Vault Hunters.</p>
          <p class="all-rewards-page__subtext">Total rewards: ${entries.length} (${obtainableRewards.length} obtainable, ${unobtainableRewards.length} unobtainable)</p>
        </header>

        <section class="rewards-section rewards-section--obtainable">
          <header class="rewards-section__header">
            <h3 class="rewards-section__title">Currently Obtainable Rewards</h3>
            <p class="rewards-section__description">These rewards can still be unlocked through gameplay or events.</p>
            <p class="rewards-section__count">${obtainableRewards.length} reward${obtainableRewards.length !== 1 ? 's' : ''}</p>
          </header>
          <div class="rewards-grid">
            ${obtainableCards}
          </div>
        </section>

        ${unobtainableSection}
      </section>
    `;

    updateQueryString(ALL_QUERY_KEYWORDS[0]);
  } catch (error) {
    resultContainer.innerHTML = `
      <section class="all-rewards-page">
        <p class="all-rewards-page__error">We couldn't load the rewards data right now. Please refresh and try again.</p>
      </section>
    `;
    updateQueryString('');
    throw error;
  }
}
