import { requireAuth } from '../../utils/auth.js';
import { loadHealth } from '../../utils/companion-health.js';
import { ApiError, methodNotAllowed, noStoreJson } from '../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'GET') return methodNotAllowed('GET');
  try {
    await requireAuth(context, { admin: true });
    return noStoreJson(await loadHealth(context.env));
  } catch (error) {
    return noStoreJson(
      {
        error:
          error instanceof ApiError
            ? error.message
            : 'Collector status is temporarily unavailable.',
      },
      error instanceof ApiError ? error.status : 500
    );
  }
}
