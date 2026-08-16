import { clearSessionCookie, deleteAuthSession, requireAuth } from '../../utils/auth.js';
import { handleApiError, methodNotAllowed, noStoreJson } from '../../utils/http.js';

export async function onRequest(context) {
  if (context.request.method !== 'POST') return methodNotAllowed('POST');

  try {
    await requireAuth(context, { csrf: true });
    await deleteAuthSession(context.request, context.env);
    const headers = new Headers({ 'cache-control': 'no-store' });
    headers.append('Set-Cookie', clearSessionCookie(context.request));
    return noStoreJson({ ok: true }, 200, headers);
  } catch (error) {
    return handleApiError(error, 'Logout failed.');
  }
}
