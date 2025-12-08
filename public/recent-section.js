// Recent users section rendering and handling

import { loadTemplate, renderTemplate } from './template-loader.js';
import { recentContainer, usernameInput, form, proxiedImageUrl, DEFAULT_FAVICON } from './dom-utils.js';
import { getRecentUsers } from './storage-manager.js';
import { escapeHtml } from './reward-utils.js';

/**
 * Render the recent users section
 */
export async function renderRecentSection() {
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

/**
 * Bind click handlers to recent user buttons
 */
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
