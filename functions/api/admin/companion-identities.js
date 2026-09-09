import { requireAuth } from '../../utils/auth.js';
import { resolveCompanionMinecraftIdentities } from '../../utils/companion-leaderboard.js';
import { handleApiError, methodNotAllowed, noStoreJson, readJson } from '../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed('POST');

  try {
    await requireAuth(context, { admin: true, csrf: true });
    const payload = await readJson(context.request, 8 * 1024);
    const stats = await resolveCompanionMinecraftIdentities(context.env, {
      twitchNames: payload.twitchNames,
    });
    return noStoreJson(stats);
  } catch (error) {
    return handleApiError(error, 'The Minecraft identities could not be updated.');
  }
}
