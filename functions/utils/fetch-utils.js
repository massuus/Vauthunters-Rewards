// Fetch utilities with timeout and retry logic

import {
  TIMEOUT_MS,
  MAX_RETRIES,
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  RETRY_BACKOFF_MULTIPLIER,
  RETRYABLE_STATUS_CODES,
} from './config.js';

/**
 * Fetch with timeout support
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} - Delay in milliseconds
 */
function getRetryDelay(attempt) {
  const delay = INITIAL_RETRY_DELAY_MS * Math.pow(RETRY_BACKOFF_MULTIPLIER, attempt);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay;
  return Math.min(delay + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if error/status is retryable
 */
function isRetryable(error, response) {
  // Network errors are retryable
  if (error?.name === 'AbortError') {
    return true;
  }

  if (error && !response) {
    return true;
  }

  // Specific HTTP status codes are retryable
  if (response && RETRYABLE_STATUS_CODES.includes(response.status)) {
    return true;
  }

  return false;
}

/**
 * Fetch with retry logic and exponential backoff
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(
  url,
  options = {},
  timeoutMs = TIMEOUT_MS,
  maxRetries = MAX_RETRIES
) {
  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      // If successful or non-retryable error, return immediately
      if (response.ok || !isRetryable(null, response)) {
        return response;
      }

      lastResponse = response;

      // If we have retries left and it's retryable, continue
      if (attempt < maxRetries && isRetryable(null, response)) {
        const delay = getRetryDelay(attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms for ${url}`);
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      // If this is the last attempt or not retryable, throw
      if (attempt >= maxRetries || !isRetryable(error, null)) {
        throw error;
      }

      const delay = getRetryDelay(attempt);
      console.log(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms due to error: ${error.message}`
      );
      await sleep(delay);
    }
  }

  // If we got here, throw the last error or return last response
  if (lastError) {
    throw lastError;
  }
  return lastResponse;
}

/**
 * Generic fetch handler with consistent error handling, timeout, and retry
 * @param {string} url - URL to fetch
 * @param {string} context - Context name for logging
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<object>} - {data?, notFound?, error?, status?, message?}
 */
export async function fetchJson(url, context = 'API', timeoutMs = TIMEOUT_MS) {
  try {
    const response = await fetchWithRetry(
      url,
      {
        headers: {
          'user-agent': 'Vauthunters Rewards/1.0 (+https://vh-rewards.massuus.com)',
          accept: 'application/json',
        },
      },
      timeoutMs
    );

    if (response.status === 404) {
      return { notFound: true, data: null };
    }

    if (!response.ok) {
      console.error(`${context} error status:`, response.status);
      return { error: true, status: response.status, data: null };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    console.error(`${context} fetch error:`, error);
    const isTimeout = error?.name === 'AbortError';
    return {
      error: true,
      message: isTimeout ? 'Request timeout' : error.message,
      isTimeout,
      data: null,
    };
  }
}
