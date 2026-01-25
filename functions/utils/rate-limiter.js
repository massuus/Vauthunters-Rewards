// Rate limiting utilities for Cloudflare Workers

import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from './config.js';

/**
 * Simple in-memory rate limiter (per-worker instance)
 * For production, consider using Cloudflare KV or Durable Objects for distributed rate limiting
 */
class RateLimiter {
  constructor(maxRequests = RATE_LIMIT_MAX_REQUESTS, windowMs = RATE_LIMIT_WINDOW_MS) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  /**
   * Check if a request should be allowed
   * @param {string} key - Unique identifier (IP, user-agent hash, etc.)
   * @returns {boolean} - Whether the request is allowed
   */
  allow(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];

    // Remove expired entries
    const validRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(key, validRequests);

    // Cleanup old entries periodically
    if (this.requests.size > 1000) {
      this.cleanup(now);
    }

    return true;
  }

  /**
   * Get rate limit info for a key
   */
  getInfo(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    const validRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);

    return {
      remaining: Math.max(0, this.maxRequests - validRequests.length),
      limit: this.maxRequests,
      resetTime: validRequests.length > 0 ? validRequests[0] + this.windowMs : now + this.windowMs,
    };
  }

  /**
   * Clean up old entries
   */
  cleanup(now) {
    for (const [key, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter((t) => now - t < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, valid);
      }
    }
  }
}

/**
 * Get a rate limit key from request
 * Uses CF-Connecting-IP if available, falls back to a hash of user-agent
 */
export function getRateLimitKey(request) {
  // Prefer Cloudflare's connecting IP header
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return `ip:${cfIp}`;

  // Fallback to user-agent hash
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return `ua:${hashString(userAgent)}`;
}

/**
 * Simple string hash function
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create rate limit response
 */
export function rateLimitResponse(info) {
  const retryAfterSeconds = Math.ceil((info.resetTime - Date.now()) / 1000);
  return new Response(
    JSON.stringify({
      error: 'Too many requests. Please try again later.',
      retryAfter: retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(info.limit),
        'X-RateLimit-Remaining': String(info.remaining),
        'X-RateLimit-Reset': String(Math.floor(info.resetTime / 1000)),
      },
    }
  );
}

// Export a singleton instance
// 60 requests per minute per IP/user-agent
export const apiRateLimiter = new RateLimiter();
