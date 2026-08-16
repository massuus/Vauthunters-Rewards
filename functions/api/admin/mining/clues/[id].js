import { requireAuth } from '../../../../utils/auth.js';
import { archiveAdminClue, updateAdminClue } from '../../../../utils/mining-db.js';
import { validateMiningSubmission } from '../../../../utils/mining-validation.js';
import { handleApiError, methodNotAllowed, noStoreJson, readJson } from '../../../../utils/http.js';

export async function onRequest(context) {
  if (!['PATCH', 'DELETE'].includes(context.request.method)) {
    return methodNotAllowed(['PATCH', 'DELETE']);
  }

  try {
    const session = await requireAuth(context, { admin: true, csrf: true });
    const clueId = String(context.params.id || '').trim();
    if (!clueId) return noStoreJson({ error: 'Clue ID is required.' }, 400);
    const body = await readJson(context.request);

    if (context.request.method === 'DELETE') {
      await archiveAdminClue(context.env, session.user, clueId, body.expectedVersion);
      return noStoreJson({ ok: true });
    }

    const payload = validateMiningSubmission(body);
    const clue = await updateAdminClue(context.env, session.user, clueId, {
      ...payload,
      expectedVersion: body.expectedVersion,
    });
    return noStoreJson({ clue });
  } catch (error) {
    return handleApiError(error, 'The clue could not be changed.');
  }
}
