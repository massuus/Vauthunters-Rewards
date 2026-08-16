import { requireAuth } from '../../../utils/auth.js';
import { listBlockedUsers } from '../../../utils/mining-db.js';
import { handleApiError, methodNotAllowed, noStoreJson } from '../../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return methodNotAllowed('GET');

  try {
    await requireAuth(context, { admin: true });
    return noStoreJson({ users: await listBlockedUsers(context.env) });
  } catch (error) {
    return handleApiError(error, 'Blocked users could not be loaded.');
  }
}
