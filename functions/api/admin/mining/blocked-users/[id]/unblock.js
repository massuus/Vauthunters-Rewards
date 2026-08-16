import { requireAuth } from '../../../../../utils/auth.js';
import { unblockUser } from '../../../../../utils/mining-db.js';
import { handleApiError, methodNotAllowed, noStoreJson } from '../../../../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed('POST');

  try {
    const session = await requireAuth(context, { admin: true, csrf: true });
    const twitchUserId = String(context.params.id || '').trim();
    await unblockUser(context.env, session.user, twitchUserId);
    return noStoreJson({ ok: true });
  } catch (error) {
    return handleApiError(error, 'The Twitch user could not be unblocked.');
  }
}
