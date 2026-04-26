import { apiRateLimiter, getRateLimitKey, rateLimitResponse } from '../utils/rate-limiter.js';
import { isLeaderboardEnabled, syncArmoryBatch } from '../utils/leaderboard.js';

const MAX_OFFSET = 1_000_000;

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

async function readBodyJson(request) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return {};
  }

  try {
    const payload = await request.json();
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

function readProvidedToken(request, url) {
  const directToken = String(request.headers.get('x-leaderboard-sync-token') || '').trim();
  if (directToken) {
    return directToken;
  }

  const authHeader = String(request.headers.get('authorization') || '').trim();
  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim();
  }

  return String(url.searchParams.get('token') || '').trim();
}

export async function onRequest({ request, env }) {
  const rateLimitKey = getRateLimitKey(request);
  if (!apiRateLimiter.allow(rateLimitKey)) {
    const info = apiRateLimiter.getInfo(rateLimitKey);
    return rateLimitResponse(info);
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed. Use POST.' }, 405, {
      Allow: 'POST',
      'cache-control': 'no-store',
    });
  }

  if (!isLeaderboardEnabled(env)) {
    return json(
      {
        error:
          'Leaderboard is not configured yet. Add a D1 binding named LEADERBOARD_DB to enable refresh jobs.',
      },
      503,
      { 'cache-control': 'no-store' }
    );
  }

  const url = new URL(request.url);
  const body = await readBodyJson(request);

  const requiredToken = String(env?.LEADERBOARD_SYNC_TOKEN || '').trim();
  if (requiredToken) {
    const providedToken = readProvidedToken(request, url);
    if (!providedToken || providedToken !== requiredToken) {
      return json({ error: 'Unauthorized sync request.' }, 401, { 'cache-control': 'no-store' });
    }
  }

  const offset = clampInt(body.offset ?? url.searchParams.get('offset'), 0, 0, MAX_OFFSET);

  const limit = clampInt(body.limit ?? url.searchParams.get('limit'), 100, 1, 300);
  const concurrency = clampInt(body.concurrency ?? url.searchParams.get('concurrency'), 6, 1, 20);
  const source = String(body.source || 'armory-seed').trim() || 'armory-seed';

  try {
    const stats = await syncArmoryBatch(env, {
      offset,
      limit,
      concurrency,
      source,
    });

    return json(
      {
        ...stats,
        warning: requiredToken
          ? undefined
          : 'LEADERBOARD_SYNC_TOKEN is not configured; this endpoint is currently open to the public.',
      },
      200,
      { 'cache-control': 'no-store' }
    );
  } catch (error) {
    console.error('Leaderboard refresh error', {
      message: error instanceof Error ? error.message : String(error),
    });

    return json(
      {
        error: 'Failed to refresh leaderboard batch. Please try again.',
      },
      500,
      { 'cache-control': 'no-store' }
    );
  }
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}
