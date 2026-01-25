// Template loader and renderer utility

import { logger } from '../core/logger.js';

const templateCache = {};

/**
 * Load a template file from the templates directory
 * Utilizes browser cache and service worker for offline support
 * @param {string} templateName - Name of the template file (without .html extension)
 * @returns {Promise<string>} The template HTML content
 */
export async function loadTemplate(templateName) {
  if (templateCache[templateName]) {
    return templateCache[templateName];
  }

  try {
    const response = await fetch(`/templates/${templateName}.html`, {
      // Use cache strategy: prefer cached over network if available
      cache: 'default',
    });
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templateName}`);
    }
    const html = await response.text();
    templateCache[templateName] = html;
    return html;
  } catch (error) {
    logger.error('Error loading template', {
      templateName,
      error: error.message,
      stack: error.stack,
    });
    return '';
  }
}

/**
 * Render a template with data
 * @param {string} template - The template HTML string
 * @param {Object} data - Data to interpolate into the template
 * @returns {string} Rendered HTML
 */
export function renderTemplate(template, data = {}) {
  let result = template;

  // Replace {{key}} with data values
  Object.keys(data).forEach((key) => {
    const value = data[key] !== undefined && data[key] !== null ? data[key] : '';
    // Use a global regex to replace all occurrences
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  });

  return result;
}

/**
 * Load and render a template in one call
 * @param {string} templateName - Name of the template file (without .html extension)
 * @param {Object} data - Data to interpolate into the template
 * @returns {Promise<string>} Rendered HTML
 */
export async function loadAndRender(templateName, data = {}) {
  const template = await loadTemplate(templateName);
  return renderTemplate(template, data);
}

/**
 * Preload multiple templates at once for faster rendering
 * Populates in-memory cache and leverages service worker cache
 * @param {string[]} templateNames - Array of template names to preload
 * @returns {Promise<void>}
 */
export async function preloadTemplates(templateNames) {
  try {
    await Promise.all(templateNames.map((name) => loadTemplate(name)));
    logger.debug(`Preloaded ${templateNames.length} templates`);
  } catch (error) {
    logger.error('Error preloading templates', { error: error.message });
  }
}

/**
 * Clear the in-memory template cache if needed
 * Service worker cache is maintained separately
 */
export function clearTemplateCache() {
  Object.keys(templateCache).forEach((key) => delete templateCache[key]);
  logger.debug('Template cache cleared');
}

/**
 * Get cache statistics for debugging
 * @returns {Object} Cache stats
 */
export function getTemplateCacheStats() {
  return {
    cached: Object.keys(templateCache).length,
    templates: Object.keys(templateCache),
  };
}
