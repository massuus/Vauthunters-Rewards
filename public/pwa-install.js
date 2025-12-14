// PWA Install Prompt Handler

import { logger } from './logger.js';

let deferredPrompt = null;
let installButton = null;

/**
 * Initialize PWA install prompt handling
 */
export function initPWAInstall() {
  // Listen for the beforeinstallprompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show the install button
    showInstallButton();
    
    logger.info('PWA install prompt available');
  });

  // Listen for successful installation
  window.addEventListener('appinstalled', () => {
    // Clear the deferredPrompt
    deferredPrompt = null;
    
    // Hide the install button
    hideInstallButton();
    
    logger.info('PWA installed successfully');
  });

  // Check if already installed
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    logger.info('PWA is running in standalone mode');
  }
}

/**
 * Show the install button in the UI
 */
function showInstallButton() {
  // Check if button already exists
  installButton = document.getElementById('pwa-install-button');
  
  if (!installButton) {
    // Create install button
    installButton = document.createElement('button');
    installButton.id = 'pwa-install-button';
    installButton.className = 'pwa-install-button';
    installButton.type = 'button';
    installButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Install App</span>
    `;
    installButton.setAttribute('aria-label', 'Install Vault Hunters Rewards as an app');
    
    // Add click handler
    installButton.addEventListener('click', handleInstallClick);
    
    // Insert into the search section (after the form)
    const searchSection = document.querySelector('.search');
    if (searchSection) {
      const form = searchSection.querySelector('.search__form');
      if (form) {
        form.insertAdjacentElement('afterend', installButton);
      }
    }
  }
  
  installButton.classList.remove('hidden');
}

/**
 * Hide the install button
 */
function hideInstallButton() {
  if (installButton) {
    installButton.classList.add('hidden');
  }
}

/**
 * Handle install button click
 */
async function handleInstallClick() {
  if (!deferredPrompt) {
    logger.warn('No deferred install prompt available');
    return;
  }
  
  // Show the install prompt
  deferredPrompt.prompt();
  
  // Wait for the user to respond to the prompt
  const { outcome } = await deferredPrompt.userChoice;
  
  logger.info('PWA install prompt outcome', { outcome });
  
  if (outcome === 'accepted') {
    logger.info('User accepted the install prompt');
  } else {
    logger.info('User dismissed the install prompt');
  }
  
  // Clear the deferredPrompt
  deferredPrompt = null;
  
  // Hide the button
  hideInstallButton();
}

/**
 * Check if PWA is installable
 */
export function isPWAInstallable() {
  return deferredPrompt !== null;
}

/**
 * Check if running as PWA
 */
export function isRunningAsPWA() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
