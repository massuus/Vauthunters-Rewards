import {
  authorizeCompanionSync,
  readSyncBody,
  importCompanionSnapshot,
} from '../utils/companion-sync.js';
import { ApiError, methodNotAllowed, noStoreJson } from '../utils/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  try {
    await authorizeCompanionSync(request, env);
    return noStoreJson(await importCompanionSnapshot(env, await readSyncBody(request)));
  } catch (error) {
    // Neither SQL bind values nor authorization headers belong in production logs.
    if (error instanceof ApiError) return noStoreJson({ error: error.message }, error.status);
    console.error('Companion automatic import failed.');
    return noStoreJson({ error: 'Automatic import failed; retry later.' }, 500);
  }
}
