// Template loader and renderer utility

import { logger } from '../core/logger.js';

const templateCache = new Map();
const templateRequests = new Map();

/**
 * Load a template file from the templates directory
 * Utilizes browser cache and service worker for offline support
 * @param {string} templateName - Name of the template file (without .html extension)
 * @returns {Promise<string>} The template HTML content
 */
export async function loadTemplate(templateName) {
  if (templateCache.has(templateName)) return templateCache.get(templateName);
  if (templateRequests.has(templateName)) return templateRequests.get(templateName);

  const pending = (async () => {
    try {
      const response = await fetch(`/templates/${templateName}.html`, {
        // Use cache strategy: prefer cached over network if available
        cache: 'default',
      });
      if (!response.ok) {
        throw new Error(`Failed to load template: ${templateName}`);
      }
      const html = await response.text();
      templateCache.set(templateName, html);
      return html;
    } catch (error) {
      logger.error('Error loading template', {
        templateName,
        error: error.message,
        stack: error.stack,
      });
      return '';
    }
  })().finally(() => templateRequests.delete(templateName));
  templateRequests.set(templateName, pending);
  return pending;
}

/**
 * Render a template with data
 * @param {string} template - The template HTML string
 * @param {Object} data - Data to interpolate into the template
 * @returns {string} Rendered HTML
 */
export function renderTemplate(template, data = {}) {
  return template.replace(/\{\{([^{}]+)\}\}/g, (placeholder, key) =>
    Object.prototype.hasOwnProperty.call(data, key) ? String(data[key] ?? '') : placeholder
  );
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
