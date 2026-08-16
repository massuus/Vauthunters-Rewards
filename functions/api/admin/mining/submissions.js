import { requireAuth } from '../../../utils/auth.js';
import { listAdminSubmissions } from '../../../utils/mining-db.js';
import { handleApiError, methodNotAllowed, noStoreJson } from '../../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return methodNotAllowed('GET');

  try {
    await requireAuth(context, { admin: true });
    const limit = new URL(context.request.url).searchParams.get('limit');
    return noStoreJson({ submissions: await listAdminSubmissions(context.env, { limit }) });
  } catch (error) {
    return handleApiError(error, 'Pending submissions could not be loaded.');
  }
}
