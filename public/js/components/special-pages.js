// Special pages logic (codes page, all rewards page, etc.)

const CODES_QUERY_KEYWORDS = ['codes', 'code'];
const ALL_QUERY_KEYWORDS = ['all', 'rewards'];
const CODES_DATA_URL = '/data/codes.json';
const SET_ART_DATA_URL = '/data/set-art.json';
const UNKNOWN_ITEM_IMAGE = '/img/unknown_item.png';

let codesDataPromise = null;
let setArtDataPromise = null;

/**
 * Check if a search query is requesting the codes page
 */
export function isCodesQuery(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return CODES_QUERY_KEYWORDS.includes(normalized);
}

/**
 * Check if a search query is requesting the all rewards page
 */
export function isAllQuery(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALL_QUERY_KEYWORDS.includes(normalized);
}

/**
 * Fetch codes data from the JSON file (with caching)
 */
export async function fetchCodesData() {
  if (!codesDataPromise) {
    codesDataPromise = fetch(CODES_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load codes');
        }
        return response.json();
      })
      .then((data) => (Array.isArray(data) ? data : []))
      .catch((error) => {
        codesDataPromise = null;
        throw error;
      });
  }

  return codesDataPromise;
}

/**
 * Fetch set art data from the JSON file (with caching)
 */
export async function fetchSetArtData() {
  if (!setArtDataPromise) {
    setArtDataPromise = fetch(SET_ART_DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load set art data');
        }
        return response.json();
      })
      .then((data) => (typeof data === 'object' && data !== null ? data : {}))
      .catch((error) => {
        setArtDataPromise = null;
        throw error;
      });
  }

  return setArtDataPromise;
}

/**
 * Render a single code card
 */
export function renderCodeCard(item, proxiedImageUrl, escapeHtml) {
  const safeName = escapeHtml(item?.name || 'Mystery Reward');
  const safeDescription = escapeHtml(item?.description || 'Watch the VOD to learn how to unlock this code.');
  
  // Support both old 'image' field and new 'images' array
  let imageSources = [];
  if (item?.images && Array.isArray(item.images)) {
    imageSources = item.images;
  } else if (item?.image) {
    imageSources = [item.image];
  } else {
    imageSources = [UNKNOWN_ITEM_IMAGE];
  }
  
  // Generate image HTML for all images
  const imagesHtml = imageSources.map(imageSource => {
    const safeImage = proxiedImageUrl(imageSource);
    const fallbackClass = imageSource === UNKNOWN_ITEM_IMAGE ? ' class="pixelated-image"' : '';
    return `<img${fallbackClass} src="${safeImage}" alt="${safeName} reward icon" loading="lazy" decoding="async" width="72" height="72">`;
  }).join('');
  
  const safeVodUrl = escapeHtml(item?.vodUrl || '#');
  const safeCode = escapeHtml(item?.code || '???');
  const safeExpiry = escapeHtml(item?.expires || '');

  return `
    <article class="codes-card">
      <div class="codes-card__header">
        ${imagesHtml}
        <h3>${safeName}</h3>
      </div>
      <p class="codes-card__description">${safeDescription}</p>
      <a class="codes-card__vod" href="${safeVodUrl}" target="_blank" rel="noopener">
        Watch VOD for code
      </a>
      ${safeExpiry ? `<p class="codes-card__expiry">Claimable until ${safeExpiry}</p>` : ''}
      <p class="codes-card__hint">
        Can't find the code in the VOD, or already watched the stream but don't remember it?
      </p>
      <div class="codes-card__reveal-row">
        <button class="codes-card__reveal" type="button" data-code="${safeCode}">
          Reveal code
        </button>
        <span class="codes-card__code" data-code-value hidden aria-live="polite"></span>
      </div>
    </article>
  `;
}

/**
 * Bind event handlers for code reveal buttons
 */
export function bindCodeRevealHandlers(resultContainer) {
  resultContainer.querySelectorAll('.codes-card__reveal').forEach((button) => {
    button.addEventListener('click', () => {
      const codeValue = button.getAttribute('data-code') || '';
      const parentCard = button.closest('.codes-card');
      if (!parentCard) return;
      const readout = parentCard.querySelector('[data-code-value]');
      if (!readout) return;
      const isHidden = readout.hasAttribute('hidden');

      if (isHidden) {
        readout.textContent = codeValue;
        readout.removeAttribute('hidden');
        button.textContent = 'Hide code';
      } else {
        readout.textContent = '';
        readout.setAttribute('hidden', '');
        button.textContent = 'Reveal code';
      }
    });
  });
}

/**
 * Render the complete codes page
 */
export async function renderCodesPage(
  resultContainer,
  setFavicon,
  setMetaDescription,
  closeSetDetailModal,
  updateQueryString,
  proxiedImageUrl,
  escapeHtml,
  DEFAULT_FAVICON
) {
  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = `
    <section class="codes-page">
      <div class="codes-page__loading">Loading codes...</div>
    </section>
  `;
  setFavicon(DEFAULT_FAVICON);
  document.title = 'Vault Hunters Reward Codes';
  setMetaDescription('Here is a comprehensive list on how to unlock all possible Vault Hunters code rewards.');
  closeSetDetailModal();

  try {
    const codes = await fetchCodesData();
    const cards = codes.length
      ? codes.map(item => renderCodeCard(item, proxiedImageUrl, escapeHtml)).join('')
      : '<p class="codes-page__empty">No featured codes yet. Check back soon!</p>';

    resultContainer.innerHTML = `
      <section class="codes-page" aria-live="polite">
        <header class="codes-page__intro">
          <h2 class="codes-page__title">Unlockable rewards using codes</h2>
          <p class="codes-page__lead">Here is a comprehensive list on how to unlock all possible code rewards.</p>
          <p class="codes-page__subtext">Watch the VODs to learn how to earn each reward, or reveal the code if you just need it fast.</p>
        </header>
        <div class="codes-grid">
          ${cards}
        </div>
        <div class="codes-page__redeem">
          <p>You can redeem the codes here:</p>
          <a class="codes-page__redeem-btn" href="https://companions.vaulthunters.gg/redeem" target="_blank" rel="noopener">
            Redeem at companions.vaulthunters.gg
          </a>
        </div>
      </section>
    `;

    bindCodeRevealHandlers(resultContainer);
    updateQueryString(CODES_QUERY_KEYWORDS[0]);
  } catch (error) {
    resultContainer.innerHTML = `
      <section class="codes-page">
        <p class="codes-page__error">We couldn't load the reward codes right now. Please refresh and try again.</p>
      </section>
    `;
    updateQueryString('');
    throw error;
  }
}

/**
 * Render a single reward item card for the all page
 */
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
  const imagesHtml = imageSources.map(imageSource => {
    const safeImage = proxiedImageUrl(imageSource);
    const isFallback = imageSource === '/img/unknown_item.png';
    const fallbackClass = isFallback ? ' class="pixelated-image"' : '';
    return `<img${fallbackClass} src="${safeImage}" alt="${escapeHtml(label)} icon" loading="lazy" decoding="async" width="72" height="72">`;
  }).join('');
  
  // Wrap images in container if there are multiple
  const imagesContainer = imageSources.length > 1 
    ? `<div class="reward-card__images">${imagesHtml}</div>` 
    : imagesHtml;
  
  const safeName = escapeHtml(label);
  const safeDescription = escapeHtml(description);

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

/**
 * Render the complete all rewards page
 */
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
      ? obtainableRewards.map(([key, data]) => renderRewardCard(key, data, proxiedImageUrl, escapeHtml, formatLabel)).join('')
      : '<p class="all-rewards-page__empty">No obtainable rewards available.</p>';
    
    const unobtainableCards = unobtainableRewards.length
      ? unobtainableRewards.map(([key, data]) => renderRewardCard(key, data, proxiedImageUrl, escapeHtml, formatLabel)).join('')
      : '';

    const unobtainableSection = unobtainableRewards.length ? `
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
    ` : '';

    resultContainer.innerHTML = `
      <section class="all-rewards-page" aria-live="polite">
        <header class="all-rewards-page__intro">
          <h2 class="all-rewards-page__title">All Vault Hunters Rewards</h2>
          <p class="all-rewards-page__lead">Browse every reward in Vault Hunters.</p>
          <p class="all-rewards-page__subtext">Total rewards: ${entries.length} (${obtainableRewards.length} obtainable, ${unobtainableRewards.length} legacy)</p>
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
