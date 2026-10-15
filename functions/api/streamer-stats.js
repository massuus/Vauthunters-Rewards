import { getSnapshotStreamerStats } from '../utils/leaderboard-snapshots.js';
import { methodNotAllowed, noStoreJson } from '../utils/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  try {
    const stats = await getSnapshotStreamerStats(env, new URL(request.url).origin);
    return Response.json(stats, {
      headers: { 'cache-control': 'public, max-age=60, s-maxage=300' },
    });
  } catch (error) {
    console.error('Streamer stats unavailable', { message: error.message });
    return noStoreJson(
      { error: 'Streamer statistics are being prepared. Please try again shortly.' },
      503
    );
  }
}
