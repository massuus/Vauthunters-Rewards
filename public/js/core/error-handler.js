// Global error handling for unhandled promise rejections and runtime errors

import { logger } from './logger.js';

/**
 * Initialize global error handlers
 */
export function initializeErrorHandlers() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault(); // Prevent default console logging

    logger.error('Unhandled Promise Rejection', {
      reason: event.reason,
      promise: event.promise,
      stack: event.reason?.stack,
    });

    // Show user-friendly error message
    showUserError('An unexpected error occurred. Please try again.');
  });

  // Handle uncaught runtime errors
  window.addEventListener('error', (event) => {
    logger.error('Uncaught Runtime Error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
      stack: event.error?.stack,
    });

    // Show user-friendly error message
    showUserError('An unexpected error occurred. Please try again.');
  });

  // Handle module loading errors
  window.addEventListener(
    'error',
    (event) => {
      if (
        event.target !== window &&
        (event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK')
      ) {
        logger.error('Resource Loading Error', {
          tag: event.target.tagName,
          src: event.target.src || event.target.href,
          type: event.target.type,
        });

        showUserError('Failed to load application resources. Please refresh the page.');
      }
    },
    true
  ); // Use capture phase to catch resource errors
}

/**
 * Show user-friendly error message
 */
function showUserError(message) {
  const feedback = document.getElementById('feedback');
  if (!feedback) return;

  feedback.textContent = message;
  feedback.className = 'feedback error';
  feedback.hidden = false;

  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (feedback.textContent === message) {
      feedback.hidden = true;
    }
  }, 5000);
}

/**
 * Wrap async functions with error boundary
 */
export function withErrorBoundary(asyncFn, fallbackValue = null) {
  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      logger.error('Error in wrapped function', {
        functionName: asyncFn.name,
        error: error.message,
        stack: error.stack,
      });
      return fallbackValue;
    }
  };
}

/**
 * Create a safe async wrapper that shows user feedback on error
 */
export function safeAsync(asyncFn, errorMessage = 'An error occurred') {
  return async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      logger.error(`Safe async error: ${errorMessage}`, {
        functionName: asyncFn.name,
        error: error.message,
        stack: error.stack,
        args,
      });
      showUserError(errorMessage);
      throw error; // Re-throw for caller to handle if needed
    }
  };
}
