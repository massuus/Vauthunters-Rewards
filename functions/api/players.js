import { searchKnownPlayers } from '../utils/leaderboard.js';
import { apiRateLimiter, getRateLimitKey, rateLimitResponse } from '../utils/rate-limiter.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed.' },
      { status: 405, headers: { Allow: 'GET' } }
    );
  }

  const query = (new URL(request.url).searchParams.get('q') || '').trim();
  if (!/^[a-z0-9_ ]{2,32}$/i.test(query)) {
    return Response.json({ players: [] });
  }

  // Suggestions have a separate bucket so typing does not exhaust profile searches.
  const key = `player-suggestions:${getRateLimitKey(request)}`;
  if (!apiRateLimiter.allow(key)) return rateLimitResponse(apiRateLimiter.getInfo(key));

  try {
    const players = await searchKnownPlayers(env, query);
    return Response.json(
      { players },
      {
        headers: { 'cache-control': 'public, max-age=60' },
      }
    );
  } catch (error) {
    console.error('Player suggestions failed', { message: error.message });
    return Response.json(
      { error: 'Suggestions are temporarily unavailable.' },
      {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      }
    );
  }
}
