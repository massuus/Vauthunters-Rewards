import { authorizeCompanionSync, readSyncBody } from '../utils/companion-sync.js';
import { storeHealth } from '../utils/companion-health.js';
import { ApiError, methodNotAllowed, noStoreJson } from '../utils/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  try {
    await authorizeCompanionSync(request, env);
    await storeHealth(env, await readSyncBody(request, 16 * 1024));
    return noStoreJson({ received: true });
  } catch (error) {
    return noStoreJson(
      { error: error instanceof ApiError ? error.message : 'Could not save collector status.' },
      error instanceof ApiError ? error.status : 500
    );
  }
}
