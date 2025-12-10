// Clipboard utility functions

import { logger } from './logger.js';

/**
 * Copy text to the clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    logger.error('Clipboard copy failed', { error: err.message, stack: err.stack });
    return false;
  }
}

/**
 * Copy share link to clipboard
 */
export async function copyShareLink(text, feedbackEl, updateFeedback) {
  const success = await copyToClipboard(text);
  updateFeedback(feedbackEl, success);
}
