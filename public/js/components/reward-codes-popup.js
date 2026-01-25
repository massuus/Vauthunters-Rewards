/**
 * Reward Codes Popup Component
 * Shows a dismissible popup to guide users to reward codes
 */

const STORAGE_KEY = 'vh-codes-popup-dismissed';
const POPUP_DELAY = 1500; // Show popup after 1.5 seconds

export class RewardCodesPopup {
  constructor() {
    this.popup = null;
    this.dismissed = this.checkDismissed();
  }

  /**
   * Check if user has previously dismissed the popup
   */
  checkDismissed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (error) {
      console.warn('Unable to access localStorage:', error);
      return false;
    }
  }

  /**
   * Mark popup as dismissed
   */
  markDismissed() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
      this.dismissed = true;
    } catch (error) {
      console.warn('Unable to save to localStorage:', error);
    }
  }

  /**
   * Create the popup HTML element
   */
  createPopup() {
    const popup = document.createElement('div');
    popup.className = 'codes-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-labelledby', 'codes-popup-title');
    popup.setAttribute('aria-describedby', 'codes-popup-description');

    popup.innerHTML = `
      <div class="codes-popup__header">
        <h3 id="codes-popup-title" class="codes-popup__title">Looking for reward codes?</h3>
        <button class="codes-popup__close" aria-label="Dismiss popup">×</button>
      </div>
      <div class="codes-popup__content">
        <p id="codes-popup-description" class="codes-popup__text">Discover all available Vault Hunters reward codes!</p>
        <a href="?codes" class="codes-popup__link">View Codes</a>
      </div>
    `;

    return popup;
  }

  /**
   * Show the popup with animation
   */
  show() {
    // Don't show if already dismissed or if we're on the codes page
    if (this.dismissed || window.location.search.includes('codes')) {
      return;
    }

    // Wait a bit before showing to not overwhelm the user
    setTimeout(() => {
      this.popup = this.createPopup();
      document.body.appendChild(this.popup);

      // Add event listeners
      const closeButton = this.popup.querySelector('.codes-popup__close');
      closeButton.addEventListener('click', () => this.dismiss());

      const link = this.popup.querySelector('.codes-popup__link');
      link.addEventListener('click', () => this.markDismissed());

      // Auto-dismiss after 15 seconds if user doesn't interact
      this.autoDismissTimeout = setTimeout(() => {
        if (this.popup && document.body.contains(this.popup)) {
          this.dismiss();
        }
      }, 15000);
    }, POPUP_DELAY);
  }

  /**
   * Dismiss the popup with animation
   */
  dismiss() {
    if (!this.popup) return;

    // Clear auto-dismiss timeout
    if (this.autoDismissTimeout) {
      clearTimeout(this.autoDismissTimeout);
    }

    // Add hiding animation
    this.popup.classList.add('hiding');

    // Remove from DOM after animation
    setTimeout(() => {
      if (this.popup && document.body.contains(this.popup)) {
        document.body.removeChild(this.popup);
      }
      this.popup = null;
    }, 300);

    // Mark as dismissed so it doesn't show again
    this.markDismissed();
  }

  /**
   * Initialize the popup
   */
  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.show());
    } else {
      this.show();
    }
  }
}

// Export for use in main app
export function initRewardCodesPopup() {
  const popup = new RewardCodesPopup();
  popup.init();
}
