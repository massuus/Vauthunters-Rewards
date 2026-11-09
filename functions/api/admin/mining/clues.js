import { requireAuth } from '../../../utils/auth.js';
import { createAdminClue } from '../../../services/mining/repository.js';
import { validateMiningSubmission } from '../../../services/mining/validation.js';
import { handleApiError, methodNotAllowed, noStoreJson, readJson } from '../../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed('POST');

  try {
    const session = await requireAuth(context, { admin: true, csrf: true });
    const payload = validateMiningSubmission(await readJson(context.request));
    const clue = await createAdminClue(context.env, session.user, payload);
    return noStoreJson({ clue }, 201);
  } catch (error) {
    return handleApiError(error, 'The clue could not be added.');
  }
}
