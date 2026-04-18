const CODES_QUERY_KEYWORDS = ['codes', 'code'];
const CODES_DATA_URL = '/data/codes.json';
const UNKNOWN_ITEM_IMAGE = '/img/unknown_item.png';

let codesDataPromise = null;

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

export function isCodesQuery(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return CODES_QUERY_KEYWORDS.includes(normalized);
}

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
