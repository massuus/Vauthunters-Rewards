/** A dismissible September message honoring members of our community. */
const POPUP_DELAY = 1500;

export class SupportPopup {
  constructor(date = new Date()) {
    this.enabled = date.getMonth() === 8;
    this.storageKey = `vh-support-popup-dismissed-${date.getFullYear()}`;
    this.popup = null;
    this.timer = null;
    try {
      this.dismissed = localStorage.getItem(this.storageKey) === 'true';
    } catch {
      this.dismissed = false;
    }
  }

  markDismissed() {
    this.dismissed = true;
    try {
      localStorage.setItem(this.storageKey, 'true');
    } catch {
      // Dismissal still works when browser storage is unavailable.
    }
  }

  createPopup() {
    const popup = document.createElement('aside');
    popup.className = 'support-popup';
    popup.setAttribute('aria-labelledby', 'support-popup-title');
    popup.innerHTML = `
      <div class="support-popup__header">
        <p class="support-popup__eyebrow">September &middot; Suicide Prevention Month</p>
        <button type="button" class="support-popup__close" aria-label="Dismiss support message">&times;</button>
      </div>
      <h3 id="support-popup-title" class="support-popup__title">You don't have to face it alone</h3>
      <div class="support-popup__tribute"><img src="/img/DuckDenied.webp" alt="DuckDenied" width="64" height="64"><p>In honour of hellpiegamin, also known as duckfromhell.</p></div>
      <p class="support-popup__text">If you're struggling, or worried about someone, support is available. Find a Helpline can help you find free, confidential support in your country.</p>
      <a href="https://findahelpline.com/" class="support-popup__link" target="_blank" rel="noopener noreferrer">Find a Helpline <span aria-hidden="true">&nearr;</span><span class="support-popup__sr-only"> (opens in a new tab)</span></a>
    `;
    popup.querySelector('.support-popup__close').addEventListener('click', () => this.dismiss());
    popup
      .querySelector('.support-popup__link')
      .addEventListener('click', () => this.markDismissed());
    popup.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.dismiss();
      }
    });
    return popup;
  }

  show() {
    if (!this.enabled || this.dismissed || this.popup || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.dismissed) return;
      this.popup = this.createPopup();
      document.body.appendChild(this.popup);
    }, POPUP_DELAY);
  }

  dismiss() {
    this.markDismissed();
    clearTimeout(this.timer);
    this.timer = null;
    const hadFocus = this.popup?.contains(document.activeElement);
    this.popup?.remove();
    this.popup = null;
    if (hadFocus) document.getElementById('username')?.focus();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.show(), { once: true });
    } else {
      this.show();
    }
  }
}

export function initSupportPopup() {
  const popup = new SupportPopup();
  popup.init();
}
