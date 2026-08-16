import { requireAuth } from '../../../utils/auth.js';
import { listUserSubmissions } from '../../../utils/mining-db.js';
import { handleApiError, methodNotAllowed, noStoreJson } from '../../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return methodNotAllowed('GET');

  try {
    const session = await requireAuth(context);
    const submissions = await listUserSubmissions(context.env, session.user.twitchUserId, 10);
    return noStoreJson({ submissions });
  } catch (error) {
    return handleApiError(error, 'Your submissions could not be loaded.');
  }
}
