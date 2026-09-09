import { requireAuth } from '../../utils/auth.js';
import { upsertCompanionPlayers } from '../../utils/companion-leaderboard.js';
import { handleApiError, methodNotAllowed, noStoreJson, readJson } from '../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed('POST');

  try {
    const session = await requireAuth(context, { admin: true, csrf: true });
    const payload = await readJson(context.request, 128 * 1024);
    const stats = await upsertCompanionPlayers(context.env, {
      streamer: payload.streamer,
      players: payload.players,
      source: payload.source || `admin:${session.user.login}`,
    });
    return noStoreJson(stats);
  } catch (error) {
    return handleApiError(error, 'The companion leaderboard could not be updated.');
  }
}
