import { getAuthSession } from '../../utils/auth.js';
import { handleApiError, methodNotAllowed, noStoreJson } from '../../utils/http.js';

export async function onRequest({ request, env }) {
  if (request.method !== 'GET') return methodNotAllowed('GET');

  try {
    const session = await getAuthSession(request, env);
    if (!session) {
      return noStoreJson({
        authenticated: false,
        twitchConfigured: Boolean(env?.TWITCH_CLIENT_ID && env?.TWITCH_CLIENT_SECRET),
      });
    }
    return noStoreJson({ authenticated: true, user: session.user });
  } catch (error) {
    return handleApiError(error, 'Login status could not be loaded.');
  }
}
