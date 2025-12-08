// Clipboard utility functions

/**
 * Copy text to the clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Clipboard copy failed:', err);
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
