// Template loader and renderer utility

import { logger } from '../core/logger.js';

const templateCache = {};

/**
 * Load a template file from the templates directory
 * @param {string} templateName - Name of the template file (without .html extension)
 * @returns {Promise<string>} The template HTML content
 */
export async function loadTemplate(templateName) {
  if (templateCache[templateName]) {
    return templateCache[templateName];
  }

  try {
    const response = await fetch(`/templates/${templateName}.html`);
    if (!response.ok) {
      throw new Error(`Failed to load template: ${templateName}`);
    }
    const html = await response.text();
    templateCache[templateName] = html;
    return html;
  } catch (error) {
    logger.error('Error loading template', { templateName, error: error.message, stack: error.stack });
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
  Object.keys(data).forEach(key => {
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
 * Preload multiple templates at once
 * @param {string[]} templateNames - Array of template names to preload
 * @returns {Promise<void>}
 */
export async function preloadTemplates(templateNames) {
  await Promise.all(templateNames.map(name => loadTemplate(name)));
}
