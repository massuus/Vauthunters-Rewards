// Special pages logic (codes page, all rewards page, etc.)

import { buildCodesLinkedHtml } from '../features/reward-utils.js';

const CODES_QUERY_KEYWORDS = ['codes', 'code'];
const ALL_QUERY_KEYWORDS = ['all', 'rewards'];
const PRESS_KIT_QUERY_KEYWORDS = ['press-kit', 'presskit', 'press', 'press kit', 'media kit'];
const CODES_DATA_URL = '/data/codes.json';
const SET_ART_DATA_URL = '/data/set-art.json';
const UNKNOWN_ITEM_IMAGE = '/img/unknown_item.png';

const PRESS_KIT_DATA = {
  version: 'v20.3.0',
  logoAssets: [
    {
      title: 'Logo — Color',
      png: 'https://vaulthunters.gg/presskit/logo/vaulthunters_logo_color.png',
      svg: 'https://vaulthunters.gg/presskit/logo/vaulthunters_logo_color.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_logo_color-90c7ef60.svg',
    },
    {
      title: 'Logo — White',
      png: 'https://vaulthunters.gg/presskit/logo/vaulthunters_logo_white.png',
      svg: 'https://vaulthunters.gg/presskit/logo/vaulthunters_logo_white.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_logo_white-ab7643ac.svg',
    },
    {
      title: 'Logo — Black',
      png: 'https://vaulthunters.gg/presskit/logo/vaulthunters_logo_black.png',
      svg: 'https://vaulthunters.gg/presskit/logo/vaulthunters_logo_black.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_logo_black-be2a3bb2.svg',
    },
    {
      title: 'Wordmark — Color',
      png: 'https://vaulthunters.gg/presskit/wordmark/vaulthunters_wordmark_color.png',
      svg: 'https://vaulthunters.gg/presskit/wordmark/vaulthunters_wordmark_color.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_wordmark_color-5102a129.svg',
    },
    {
      title: 'Wordmark — White',
      png: 'https://vaulthunters.gg/presskit/wordmark/vaulthunters_wordmark_white.png',
      svg: 'https://vaulthunters.gg/presskit/wordmark/vaulthunters_wordmark_white.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_wordmark_white-82aae038.svg',
    },
    {
      title: 'Wordmark — Black',
      png: 'https://vaulthunters.gg/presskit/wordmark/vaulthunters_wordmark_black.png',
      svg: 'https://vaulthunters.gg/presskit/wordmark/vaulthunters_wordmark_black.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_wordmark_black-7c243d52.svg',
    },
    {
      title: 'Monogram — Color',
      png: 'https://vaulthunters.gg/presskit/monogram/vaulthunters_monogram_color.png',
      svg: 'https://vaulthunters.gg/presskit/monogram/vaulthunters_monogram_color.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_monogram_color-bbd1672f.svg',
    },
    {
      title: 'Monogram — White',
      png: 'https://vaulthunters.gg/presskit/monogram/vaulthunters_monogram_white.png',
      svg: 'https://vaulthunters.gg/presskit/monogram/vaulthunters_monogram_white.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_monogram_white-de81bedd.svg',
    },
    {
      title: 'Monogram — Black',
      png: 'https://vaulthunters.gg/presskit/monogram/vaulthunters_monogram_black.png',
      svg: 'https://vaulthunters.gg/presskit/monogram/vaulthunters_monogram_black.svg',
      preview: 'https://vaulthunters.gg/assets/vaulthunters_monogram_black-1820c60d.svg',
    },
  ],
  colors: [
    { name: 'Main Dark', hex: '#171a1d', rgb: 'rgb(23, 26, 29)' },
    { name: 'Main Light', hex: '#ffffff', rgb: 'rgb(255, 255, 255)' },
    { name: 'Brand Accent', hex: '#ff9a10', rgb: 'rgb(255, 154, 16)' },
    { name: 'Medium', hex: '#262b31', rgb: 'rgb(38, 43, 49)' },
    { name: 'Scrappy', hex: '#bcbcbc', rgb: 'rgb(188, 188, 188)' },
    { name: 'Common', hex: '#51aeff', rgb: 'rgb(81, 174, 255)' },
    { name: 'Rare', hex: '#ffe800', rgb: 'rgb(255, 232, 0)' },
    { name: 'Epic', hex: '#ff00ff', rgb: 'rgb(255, 0, 255)' },
    { name: 'Omega', hex: '#6aff00', rgb: 'rgb(106, 255, 0)' },
    { name: 'Unique', hex: '#ed7b24', rgb: 'rgb(237, 123, 36)' },
    { name: 'Chaotic', hex: '#9b51ff', rgb: 'rgb(155, 81, 255)' },
    { name: 'Alt Dark', hex: '#111213', rgb: 'rgb(17, 18, 19)' },
  ],
  typography: [
    {
      name: 'Funnel Sans',
      use: 'Headings and UI elements',
      link: 'https://fonts.google.com/specimen/Funnel+Sans',
    },
    {
      name: 'Inter',
      use: 'Body text and readability',
      link: 'https://fonts.google.com/specimen/Inter',
    },
  ],
  screenshots: [
    {
      title: 'Challenge: Dragon',
      url: 'https://vaulthunters.gg/assets/dragon-ec25c1a4.webp',
    },
    {
      title: 'Challenge: Lab (Green)',
      url: 'https://vaulthunters.gg/assets/lab_green-09fa3a4f.webp',
    },
    {
      title: 'Challenge: Lab (Orange)',
      url: 'https://vaulthunters.gg/assets/lab_orange-7dee3110.webp',
    },
    {
      title: 'Challenge: Village (Gilded)',
      url: 'https://vaulthunters.gg/assets/village_gilded-da9df84e.webp',
    },
    {
      title: 'Challenge: Village (Living)',
      url: 'https://vaulthunters.gg/assets/village_living-8e5d7399.webp',
    },
    {
      title: 'Challenge: Village (Ornate)',
      url: 'https://vaulthunters.gg/assets/village_ornate-1b7cab2f.webp',
    },
    {
      title: 'Challenge: X-Mark (Top)',
      url: 'https://vaulthunters.gg/assets/xmark_top-c00a2164.webp',
    },
    {
      title: 'Omega: Blacksmith (1)',
      url: 'https://vaulthunters.gg/assets/blacksmith1-e2cc843c.webp',
    },
    {
      title: 'Omega: Cove (1)',
      url: 'https://vaulthunters.gg/assets/cove1-5ec1113d.webp',
    },
    {
      title: 'Omega: Digsite',
      url: 'https://vaulthunters.gg/assets/digsite-2a7b30fd.webp',
    },
    {
      title: 'Omega: Library (1)',
      url: 'https://vaulthunters.gg/assets/library1-2c55a10d.webp',
    },
    {
      title: 'Omega: Mine (1)',
      url: 'https://vaulthunters.gg/assets/mine1-0dfdeba0.webp',
    },
    {
      title: 'Omega: Mushroom',
      url: 'https://vaulthunters.gg/assets/mushroom1-7b6fbf23.webp',
    },
    {
      title: 'Themes: Glimmergrove (1)',
      url: 'https://vaulthunters.gg/assets/glimmergrove1-b6e1933c.webp',
    },
    {
      title: 'Themes: Snowfell (1)',
      url: 'https://vaulthunters.gg/assets/snowfell1-026482e4.webp',
    },
    {
      title: 'Themes: Sporegrove (1)',
      url: 'https://vaulthunters.gg/assets/sporegrove1-fb5b54bf.webp',
    },
  ],
};

let codesDataPromise = null;
let setArtDataPromise = null;

/**
 * Check if a code has expired based on its expiry date
 */
function isCodeExpired(expiryDateString) {
  if (!expiryDateString) return false;

  try {
    // Parse date in DD-MM-YYYY format
    const [day, month, year] = expiryDateString.split('-').map(Number);
    if (!day || !month || !year) return false;

    const expiryDate = new Date(year, month - 1, day);
    // Set to end of day for comparison
    expiryDate.setHours(23, 59, 59, 999);

    return new Date() > expiryDate;
  } catch {
    return false;
  }
}

/**
 * Check if a search query is requesting the codes page
 */
export function isCodesQuery(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return CODES_QUERY_KEYWORDS.includes(normalized);
}

/**
 * Check if a search query is requesting the all rewards page
 */
export function isAllQuery(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return ALL_QUERY_KEYWORDS.includes(normalized);
}

/**
 * Check if a search query is requesting the press kit page
 */
export function isPressKitQuery(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return PRESS_KIT_QUERY_KEYWORDS.includes(normalized);
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

/**
 * Render a single code card
 */
export function renderCodeCard(item, proxiedImageUrl, escapeHtml, isExpired = false) {
  const safeName = escapeHtml(item?.name || 'Mystery Reward');
  const safeDescription = escapeHtml(
    item?.description || 'Watch the VOD to learn how to unlock this code.'
  );

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
  const imagesHtml = imageSources
    .map((imageSource) => {
      const safeImage = proxiedImageUrl(imageSource);
      const fallbackClass = imageSource === UNKNOWN_ITEM_IMAGE ? ' class="pixelated-image"' : '';
      return `<img${fallbackClass} src="${safeImage}" alt="${safeName} reward icon" loading="lazy" decoding="async" width="72" height="72">`;
    })
    .join('');

  const safeVodUrl = escapeHtml(item?.vodUrl || '#');
  const safeCode = escapeHtml(item?.code || '???');
  const safeExpiry = escapeHtml(item?.expires || '');
  const expiredClass = isExpired ? ' codes-card--expired' : '';

  return `
    <article class="codes-card${expiredClass}">
      <div class="codes-card__header">
        ${imagesHtml}
        <h3>${safeName}</h3>
        ${isExpired ? '<span class="codes-card__expired-badge">Expired</span>' : ''}
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
  setMetaDescription(
    'Here is a comprehensive list on how to unlock all possible Vault Hunters code rewards.'
  );
  closeSetDetailModal();

  try {
    const codes = await fetchCodesData();

    // Separate active and expired codes
    const activeCodes = [];
    const expiredCodes = [];
    codes.forEach((item) => {
      if (isCodeExpired(item?.expires)) {
        expiredCodes.push(item);
      } else {
        activeCodes.push(item);
      }
    });

    // Render active codes
    const activeCards = activeCodes.length
      ? activeCodes.map((item) => renderCodeCard(item, proxiedImageUrl, escapeHtml, false)).join('')
      : '';

    // Render expired codes
    const expiredCards = expiredCodes.length
      ? expiredCodes.map((item) => renderCodeCard(item, proxiedImageUrl, escapeHtml, true)).join('')
      : '';

    // Build expired section with collapsible toggle
    const expiredSection = expiredCodes.length
      ? `
      <div class="codes-expired-section">
        <button class="codes-expired-toggle" aria-expanded="false" aria-controls="expired-codes-container">
          <span class="codes-expired-toggle__icon">▶</span>
          <span class="codes-expired-toggle__text">View expired codes (${expiredCodes.length})</span>
        </button>
        <div id="expired-codes-container" class="codes-grid codes-grid--expired" hidden>
          ${expiredCards}
        </div>
      </div>
    `
      : '';

    const mainContent =
      activeCodes.length || expiredCodes.length
        ? `
        ${activeCards ? `<div class="codes-grid">${activeCards}</div>` : ''}
        ${expiredSection}
      `
        : '<p class="codes-page__empty">No featured codes yet. Check back soon!</p>';

    resultContainer.innerHTML = `
      <section class="codes-page" aria-live="polite">
        <header class="codes-page__intro">
          <h2 class="codes-page__title">Unlockable rewards using codes</h2>
          <p class="codes-page__lead">Here is a comprehensive list on how to unlock all possible code rewards.</p>
          <p class="codes-page__subtext">Watch the VODs to learn how to earn each reward, or reveal the code if you just need it fast.</p>
        </header>
        ${mainContent}
        <div class="codes-page__redeem">
          <p>You can redeem the codes here:</p>
          <a class="codes-page__redeem-btn" href="https://companions.vaulthunters.gg/redeem" target="_blank" rel="noopener">
            Redeem at companions.vaulthunters.gg
          </a>
        </div>
      </section>
    `;

    bindCodeRevealHandlers(resultContainer);
    bindExpiredCodesToggle(resultContainer);
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
 * Bind event handlers for expired codes toggle button
 */
export function bindExpiredCodesToggle(resultContainer) {
  const toggleButton = resultContainer.querySelector('.codes-expired-toggle');
  if (!toggleButton) return;

  toggleButton.addEventListener('click', () => {
    const container = document.getElementById(toggleButton.getAttribute('aria-controls'));
    if (!container) return;

    const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
    toggleButton.setAttribute('aria-expanded', !isExpanded);

    if (isExpanded) {
      container.setAttribute('hidden', '');
    } else {
      container.removeAttribute('hidden');
    }
  });
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

function renderPressKitAssetCard(item, escapeHtml) {
  const safeTitle = escapeHtml(item?.title || 'Brand Asset');
  const safePng = escapeHtml(item?.png || '#');
  const safeSvg = escapeHtml(item?.svg || '#');
  const safePreview = escapeHtml(item?.preview || '');

  return `
    <article class="press-kit-asset-card">
      <div class="press-kit-asset-card__preview">
        <img src="${safePreview}" alt="${safeTitle} preview" loading="lazy" decoding="async" width="360" height="120">
      </div>
      <h4>${safeTitle}</h4>
      <div class="press-kit-asset-card__links">
        <a href="${safePng}" target="_blank" rel="noopener">PNG</a>
        <a href="${safeSvg}" target="_blank" rel="noopener">SVG</a>
      </div>
    </article>
  `;
}

function renderPressKitColorCard(color, escapeHtml) {
  const safeName = escapeHtml(color?.name || 'Color');
  const safeHex = escapeHtml(color?.hex || '#000000');
  const safeRgb = escapeHtml(color?.rgb || 'rgb(0, 0, 0)');

  return `
    <article class="press-kit-color-card">
      <div class="press-kit-color-card__swatch" style="--swatch:${safeHex}" aria-hidden="true"></div>
      <h4>${safeName}</h4>
      <p>${safeHex}</p>
      <p>${safeRgb}</p>
    </article>
  `;
}

function renderPressKitScreenshotCard(item, escapeHtml) {
  const safeTitle = escapeHtml(item?.title || 'Screenshot');
  const safeUrl = escapeHtml(item?.url || '#');

  return `
    <article class="press-kit-shot-card">
      <img src="${safeUrl}" alt="${safeTitle}" loading="lazy" decoding="async" width="640" height="360">
      <div class="press-kit-shot-card__body">
        <h4>${safeTitle}</h4>
        <a href="${safeUrl}" target="_blank" rel="noopener">Download</a>
      </div>
    </article>
  `;
}

export async function renderPressKitPage(
  resultContainer,
  setFavicon,
  setMetaDescription,
  closeSetDetailModal,
  updateQueryString,
  escapeHtml,
  DEFAULT_FAVICON
) {
  resultContainer.classList.remove('hidden');
  setFavicon(DEFAULT_FAVICON);
  document.title = 'Vault Hunters Press Kit';
  setMetaDescription(
    'Official Vault Hunters press-kit assets, palette, typography, and screenshots.'
  );
  closeSetDetailModal();

  const assetsHtml = PRESS_KIT_DATA.logoAssets
    .map((item) => renderPressKitAssetCard(item, escapeHtml))
    .join('');

  const colorsHtml = PRESS_KIT_DATA.colors
    .map((item) => renderPressKitColorCard(item, escapeHtml))
    .join('');

  const typographyHtml = PRESS_KIT_DATA.typography
    .map((font) => {
      const safeName = escapeHtml(font?.name || 'Typeface');
      const safeUse = escapeHtml(font?.use || 'Brand typography');
      const safeLink = escapeHtml(font?.link || '#');

      return `
        <article class="press-kit-type-card">
          <h4>${safeName}</h4>
          <p>${safeUse}</p>
          <a href="${safeLink}" target="_blank" rel="noopener">View on Google Fonts</a>
        </article>
      `;
    })
    .join('');

  const screenshotsHtml = PRESS_KIT_DATA.screenshots
    .map((item) => renderPressKitScreenshotCard(item, escapeHtml))
    .join('');

  resultContainer.innerHTML = `
    <section class="press-kit-page" aria-live="polite">
      <header class="press-kit-page__intro">
        <h2 class="press-kit-page__title">Vault Hunters Press Kit</h2>
        <p class="press-kit-page__lead">Brand assets and media resources for creators, communities, and coverage.</p>
        <p class="press-kit-page__subtext">Minecraft Modpack · ${escapeHtml(PRESS_KIT_DATA.version)}</p>
      </header>

      <section class="press-kit-section">
        <h3>Brand Usage</h3>
        <p>The Vault Hunters logo is the primary brand mark and can be used in fan content, streams, and community projects.</p>
        <p class="press-kit-section__warning">Do not create or sell commercial products using Vault Hunters logos or brand assets.</p>
      </section>

      <section class="press-kit-section">
        <h3>Logo & Brand Assets</h3>
        <div class="press-kit-assets-grid">${assetsHtml}</div>
      </section>

      <section class="press-kit-section">
        <h3>Color Palette</h3>
        <div class="press-kit-colors-grid">${colorsHtml}</div>
      </section>

      <section class="press-kit-section">
        <h3>Typography</h3>
        <div class="press-kit-type-grid">${typographyHtml}</div>
      </section>

      <section class="press-kit-section">
        <h3>Screenshots</h3>
        <p class="press-kit-section__hint">Click any screenshot to download the full resolution image.</p>
        <div class="press-kit-shots-grid">${screenshotsHtml}</div>
      </section>

      <section class="press-kit-section press-kit-section--links">
        <h3>Official Links</h3>
        <div class="press-kit-link-row">
          <a href="https://vaulthunters.gg/patch-notes" target="_blank" rel="noopener">Patch Notes</a>
          <a href="https://www.reddit.com/r/VaultHuntersMinecraft/" target="_blank" rel="noopener">Reddit</a>
          <a href="https://discord.gg/rF2xWENwbV" target="_blank" rel="noopener">Discord</a>
          <a href="https://wiki.vaulthunters.gg/" target="_blank" rel="noopener">Wiki</a>
          <a href="https://vaulthunters.gg/press-kit" target="_blank" rel="noopener">Official Press Kit</a>
        </div>
      </section>
    </section>
  `;

  updateQueryString(PRESS_KIT_QUERY_KEYWORDS[0]);
}
