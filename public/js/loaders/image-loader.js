// Image loading utilities with skeleton states

import { IMAGE_FADE_IN_MS } from '../utils/config.js';

/**
 * Create an image element with lazy loading and skeleton state
 * @param {string} src - Image source URL
 * @param {string} alt - Alt text
 * @param {object} options - Additional options
 * @param {string} options.className - CSS class names
 * @param {number|string} options.width - Width
 * @param {number|string} options.height - Height
 * @param {boolean} options.pixelated - Apply pixelated styling
 * @param {string} options.srcset - Responsive sources (e.g., "small.jpg 480w, large.jpg 1024w")
 * @param {function} options.onLoad - Load callback
 * @param {function} options.onError - Error callback
 * @returns {HTMLElement} - Container with skeleton and image
 */
export function createLazyImage(src, alt = '', options = {}) {
  const {
    className = '',
    width,
    height,
    pixelated = false,
    srcset = '',
    onLoad,
    onError,
  } = options;

  // Create container
  const container = document.createElement('div');
  container.className = `lazy-img-container ${className}`;
  container.style.position = 'relative';

  if (width) container.style.width = typeof width === 'number' ? `${width}px` : width;
  if (height) container.style.height = typeof height === 'number' ? `${height}px` : height;

  // Create skeleton placeholder
  const skeleton = document.createElement('div');
  skeleton.className = 'img-skeleton';
  skeleton.style.position = 'absolute';
  skeleton.style.inset = '0';
  skeleton.style.borderRadius = 'inherit';
  container.appendChild(skeleton);

  // Create image
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  img.loading = 'lazy';
  if (srcset) img.srcset = srcset;
  img.className = `lazy-img ${pixelated ? 'pixelated-image' : ''}`;
  img.style.opacity = '0';
  img.style.transition = `opacity ${IMAGE_FADE_IN_MS}ms ease`;
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';

  // Handle successful load
  img.addEventListener('load', () => {
    img.style.opacity = '1';
    img.classList.add('loaded');
    setTimeout(() => {
      skeleton.remove();
    }, IMAGE_FADE_IN_MS);

    if (onLoad) onLoad(img);
  });

  // Handle error
  img.addEventListener('error', () => {
    skeleton.remove();
    container.innerHTML = `
      <div class="img-error" style="
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 107, 107, 0.1);
        border: 1px solid rgba(255, 107, 107, 0.3);
        border-radius: inherit;
        height: 100%;
        color: #ff6b6b;
        font-size: 0.85rem;
      ">
        Failed to load
      </div>
    `;

    if (onError) onError(img);
  });

  container.appendChild(img);
  return container;
}

/**
 * Enhance existing images with lazy loading and skeleton states
 * Supports data-src for deferred loading and data-srcset for responsive sources
 * @param {HTMLImageElement} img - Existing image element
 */
export function enhanceImageWithSkeleton(img) {
  // Skip if already loaded or no src
  if (img.complete || (!img.src && !img.dataset.src)) return;

  const parent = img.parentElement;
  if (!parent) return;

  // Create skeleton
  const skeleton = document.createElement('div');
  skeleton.className = 'img-skeleton';
  skeleton.style.position = 'absolute';
  skeleton.style.inset = '0';
  skeleton.style.borderRadius = getComputedStyle(img).borderRadius;
  skeleton.style.pointerEvents = 'none';

  // Position relative parent if needed
  const position = getComputedStyle(parent).position;
  if (position === 'static') {
    parent.style.position = 'relative';
  }

  parent.insertBefore(skeleton, img);

  // Set initial opacity
  img.style.opacity = '0';
  img.style.transition = `opacity ${IMAGE_FADE_IN_MS}ms ease`;

  // Handle deferred loading via data-src
  if (img.dataset.src && !img.src) {
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
  }

  // Handle responsive sources via data-srcset
  if (img.dataset.srcset && !img.srcset) {
    img.srcset = img.dataset.srcset;
    img.removeAttribute('data-srcset');
  }

  // Handle load
  const handleLoad = () => {
    img.style.opacity = '1';
    setTimeout(() => {
      skeleton.remove();
    }, IMAGE_FADE_IN_MS);
  };

  // Handle error
  const handleError = () => {
    skeleton.remove();
    img.style.opacity = '0.3';
  };

  img.addEventListener('load', handleLoad, { once: true });
  img.addEventListener('error', handleError, { once: true });
}

/**
 * Auto-enhance all images with data-lazy attribute
 */
export function initLazyImages() {
  const images = document.querySelectorAll('img[data-lazy]');
  images.forEach((img) => {
    enhanceImageWithSkeleton(img);
  });

  // Use IntersectionObserver for better performance with many images
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          imageObserver.unobserve(img);
        }
      });
    });

    document.querySelectorAll('img[data-src]').forEach((img) => {
      imageObserver.observe(img);
    });
  }
}
